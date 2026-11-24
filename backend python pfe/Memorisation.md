Mémo complet Raspberry Pi 5 / Hotspot / Smart Traffic
1. Matériel & principe
Raspberry Pi 5
Téléphone branché en USB au Pi
→ Partage de connexion USB activé → Internet arrive sur l’interface usb0 du Pi
MacBook connecté en Wi-Fi au hotspot du Pi : RPi-Hotspot
→ Le Pi sert de routeur / point d’accès pour ton Mac
Résultat :
Le Pi a Internet via le téléphone
Le Mac a Internet via le Pi
Tu peux accéder au Pi en SSH et VNC
2. Procédure pour utiliser le Pi partout
Allumer le Raspberry Pi
Il crée automatiquement le Wi-Fi RPi-Hotspot
Brancher le téléphone en USB au Pi + activer Partage USB / Modem USB
Sur le Mac : se connecter au Wi-Fi RPi-Hotspot
Tu as alors :
SSH :
ssh emna@10.42.0.1
VNC :
Adresse à mettre dans VNC Viewer : 10.42.0.1
Internet sur le Mac : via le Pi (qui lui-même passe par ton téléphone)
3. Vérifications de base
3.1. Depuis le Mac
Une fois connecté à RPi-Hotspot :
ping 10.42.0.1       # vérifier que le Pi répond
ssh emna@10.42.0.1   # se connecter en SSH



Hostname : emna2.local (C'est l'adresse "nommée" de ton Pi sur le réseau).

Username : emna2

Password : Celui que tu as tapé sous les points noirs (indispensable pour les commandes sudo).

2. La configuration réseau (Onglet General)

SSID : TOPNET_D060

WiFi Password : Le mot de passe de ta box.
ssh emna2@172.16.10.212 non non 