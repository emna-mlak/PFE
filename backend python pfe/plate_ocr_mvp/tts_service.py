"""
TTS local pour la Raspberry Pi (sans internet).

Idée générale en 3 lignes :
  1) Le backend renvoie un dictionnaire (matricule, statut, vignettes…).
  2) Si c’est « impayé », on construit une phrase et on appelle espeak-ng.
  3) On mémorise l’heure de la dernière annonce par plaque pour ne pas rabâcher.

Installation : sudo apt install -y espeak-ng
Test shell : espeak-ng -v fr "Bonjour"
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import time
from typing import Any, Mapping

# Pourquoi c’est utile
#Si la caméra voit la même voiture pendant plusieurs frames, sans ça le système dirait 20 fois : Attention, véhicule 240 TUN 7473, vignette impayée.
_derniere_annonce: dict[str, float] = {}

def reset_tts_cooldown() -> None:
    """Vide l’historique (utile pour les tests)."""
    _derniere_annonce.clear()

def est_vignette_impayee(d: Mapping[str, Any]) -> bool: #reçoit un dictionnaire d
    #les clés sont des textes (str) etles valeurs peuvent être n’importe quoi (Any)
    """True si le véhicule a une vignette impayée selon la réponse JSON."""
    statut = str(d.get("vehicleStatus") or "").strip().lower()
    if statut == "vignette_impayee":
        return True

    def _impaye_brut(valeur: object) -> bool:
        s = str(valeur or "").strip().lower().replace("é", "e")
        return s in ("impaye", "impayee", "non_payee", "nonpayee", "unpaid", "due")

    liste = d.get("vignettes")
    if isinstance(liste, list):
        for item in liste:
            if isinstance(item, dict) and _impaye_brut(item.get("statutPaiement")):
                return True

    v = d.get("vignette")
    if isinstance(v, dict):
        if _impaye_brut(v.get("statutPaiement")) or _impaye_brut(v.get("status")):
            return True
    return False


# Alias pour ne pas casser un éventuel import sous l’ancien nom
def backend_indicates_unpaid_vignette(result: Mapping[str, Any]) -> bool:
    return est_vignette_impayee(result)


def _texte_pour_la_plaque(d: Mapping[str, Any]) -> str:
    """Texte dicté pour la plaque, idéalement « 240 TUN 7473 »."""
    t = d.get("secondaryText")
    if isinstance(t, str) and t.strip():
        return t.strip()
    disp = d.get("display")
    if isinstance(disp, dict):
        t2 = disp.get("secondaryText")
        if isinstance(t2, str) and t2.strip():
            return t2.strip()
    compact = re.sub(r"[^0-9A-Z]", "", str(d.get("matricule") or "").upper())
    m = re.fullmatch(r"(\d{3})TUN(\d{4})", compact, flags=re.IGNORECASE)
    if m:
        return f"{m.group(1)} TUN {m.group(2)}"
    return compact or "matricule inconnue"


def _cle_plaque_pour_cooldown(d: Mapping[str, Any]) -> str:
    """Clé stable « 240TUN7473 » pour savoir si on a déjà parlé récemment."""
    compact = re.sub(r"[^0-9A-Z]", "", str(d.get("matricule") or "").upper())
    if re.fullmatch(r"\d{3}TUN\d{4}", compact, flags=re.IGNORECASE):
        return compact.upper()
    m = re.search(r"(\d{3})\s*TUN\s*(\d{4})", _texte_pour_la_plaque(d), flags=re.IGNORECASE)
    if m:
        return f"{m.group(1)}TUN{m.group(2)}".upper()
    return compact or _texte_pour_la_plaque(d)


def phrase_vignette_impayee(matricule_affichee: str) -> str:
    """La phrase entendue par l’agent."""
    p = (matricule_affichee or "").strip() or "matricule inconnue"
    return f"Attention, véhicule {p}, vignette impayée."


def build_unpaid_vignette_phrase(matricule_display: str, *, with_attention: bool = True) -> str:
    """Compatibilité : même sens que phrase_vignette_impayee (with_attention ignoré si True)."""
    p = (matricule_display or "").strip() or "matricule inconnue"
    if with_attention:
        return f"Attention, véhicule {p}, vignette impayée."
    return f"Véhicule {p}, vignette impayée."


def speak_local_espeak(text: str, *, timeout_sec: float = 90.0) -> None:
    """Lance espeak-ng (Linux/RPi) ; fallback sur `say` en macOS."""
    exe = os.environ.get("ESPEAK_BIN") or shutil.which("espeak-ng") or shutil.which("espeak")
    if not exe and sys.platform == "darwin":
        say_bin = shutil.which("say")
        if say_bin:
            subprocess.run([say_bin, str(text)], check=False, timeout=timeout_sec)
            return
    if not exe:
        raise FileNotFoundError(
            "Installez espeak-ng sur Linux/Raspberry Pi (sudo apt install -y espeak-ng) "
            "ou utilisez `say` sur macOS."
        )

    voix = os.environ.get("PLATE_OCR_TTS_VOICE", "fr")
    vitesse = os.environ.get("PLATE_OCR_TTS_SPEED", "155")
    volume = os.environ.get("PLATE_OCR_TTS_AMPLITUDE", "100")
    subprocess.run(
        [exe, "-v", voix, "-s", str(vitesse), "-a", str(volume), text],
        check=False,
        timeout=timeout_sec,
    )


def announce_unpaid_vignette_if_needed(
    backend_result: Mapping[str, Any],
    *,
    dry_run: bool = False,
) -> bool:
    """
    Fonction principale : appelez-la avec le dict renvoyé par le backend.

    - Pas impayé -> ne fait rien, retourne False.
    - Impayé mais déjà annoncé il y a moins de X secondes -> ne fait rien, False.
    - Impayé et pas trop tôt -> espeak, True.
    """
    cooldown = float(os.environ.get("PLATE_OCR_TTS_COOLDOWN_SEC", "12"))

    if not est_vignette_impayee(backend_result):
        return False

    cle = _cle_plaque_pour_cooldown(backend_result)
    maintenant = time.monotonic()
    if maintenant - _derniere_annonce.get(cle, 0.0) < cooldown:
        return False

    if dry_run:
        return True

    texte = phrase_vignette_impayee(_texte_pour_la_plaque(backend_result))
    speak_local_espeak(texte)
    _derniere_annonce[cle] = maintenant
    return True


def announce_unpaid_vignette(matricule_display: str) -> bool:
    """Version courte quand vous n’avez que la plaque affichée (ex. « 240 TUN 7473 »)."""
    m = re.search(r"(\d{3})\s*TUN\s*(\d{4})", matricule_display or "", flags=re.IGNORECASE)
    compact = f"{m.group(1)}TUN{m.group(2)}".upper() if m else re.sub(
        r"[^0-9A-Z]", "", (matricule_display or "").upper()
    )
    faux = {
        "vehicleStatus": "vignette_impayee",
        "secondaryText": matricule_display,
        "matricule": compact,
    }
    return announce_unpaid_vignette_if_needed(faux)


def announce_vehicle_status(matricule_display: str, status: str) -> bool:
    """Si le statut API est vignette_impayee, annonce ; sinon silence."""
    if str(status).strip().lower() != "vignette_impayee":
        return False
    return announce_unpaid_vignette(matricule_display)


if __name__ == "__main__":
    reset_tts_cooldown()
    exemple_payee = {"vehicleStatus": "ok", "matricule": "217TUN4505", "secondaryText": "217 TUN 4505"}
    exemple_impayee = {
        "vehicleStatus": "vignette_impayee",
        "matricule": "240TUN7473",
        "secondaryText": "240 TUN 7473",
    }
    print("Payé -> annonce ?", announce_unpaid_vignette_if_needed(exemple_payee, dry_run=True))
    print("Impayé -> annonce ?", announce_unpaid_vignette_if_needed(exemple_impayee, dry_run=True))
    print("Phrase :", phrase_vignette_impayee("240 TUN 7473"))
