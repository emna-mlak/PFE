package com.pfe.vuzixar.camera

import java.util.concurrent.atomic.AtomicReference

/**
 * Dernière frame JPEG encodée — une seule slot (pas de backlog mémoire).
 */
class JpegFrameStore {
    private val latest = AtomicReference<ByteArray?>(null)

    fun update(jpeg: ByteArray) {
        latest.set(jpeg)
    }

    /** Consomme la frame la plus récente (évite de renvoyer deux fois la même). */
    fun consume(): ByteArray? = latest.getAndSet(null)

    fun peek(): ByteArray? = latest.get()

    fun clear() {
        latest.set(null)
    }
}
