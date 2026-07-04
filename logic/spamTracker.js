/**
 * @description In-memory sliding-window store of recent message events per user.
 *
 * No discord.js dependency. Every read/write takes an optional `now` so the
 * sliding windows are deterministic in tests. State is intentionally ephemeral
 * (lost on restart): the attack is a seconds-long burst, so a restart only
 * momentarily blinds the detector and it re-accumulates within seconds. This
 * module is the single swap point should durable storage ever be wanted.
 *
 * Event shape: { channelId, messageId, timestamp, hasImage, isVoiceText }
 */

const { config } = require("./spamConfig");

/** @type {Map<string, Array<object>>} userId -> events */
const events = new Map();

/**
 * Drop events for a user older than the max window, and delete the key if empty.
 */
function prune(userId, now = Date.now()) {
    const list = events.get(userId);
    if (!list) return;
    const cutoff = now - config.windowMaxMs;
    let i = 0;
    while (i < list.length && list[i].timestamp < cutoff) i++;
    if (i > 0) list.splice(0, i);
    if (list.length === 0) events.delete(userId);
}

/** Prune every tracked user. Called on an interval to bound memory. */
function pruneAll(now = Date.now()) {
    for (const userId of events.keys()) prune(userId, now);
}

/**
 * Record a message event for a user, then prune + cap.
 * @returns {object} the stored event
 */
function record(userId, evt, now = Date.now()) {
    let list = events.get(userId);
    if (!list) {
        list = [];
        events.set(userId, list);
    }
    const stored = {
        channelId: evt.channelId,
        messageId: evt.messageId,
        timestamp: evt.timestamp != null ? evt.timestamp : now,
        hasImage: !!evt.hasImage,
        isVoiceText: !!evt.isVoiceText,
    };
    list.push(stored);
    prune(userId, now);
    // Flood guard: never let one user's buffer grow unbounded.
    if (list.length > config.perUserEventCap) {
        list.splice(0, list.length - config.perUserEventCap);
    }
    return stored;
}

/** Events for a user within the last `ms`. */
function windowEvents(userId, ms, now = Date.now()) {
    const list = events.get(userId);
    if (!list) return [];
    const cutoff = now - ms;
    return list.filter((e) => e.timestamp >= cutoff);
}

/** Count of distinct channels a user posted to within the last `ms`. */
function distinctChannels(userId, ms, now = Date.now()) {
    const set = new Set();
    for (const e of windowEvents(userId, ms, now)) set.add(e.channelId);
    return set.size;
}

/** Count of distinct channels where the user posted an image within `ms`. */
function imageChannels(userId, ms, now = Date.now()) {
    const set = new Set();
    for (const e of windowEvents(userId, ms, now)) {
        if (e.hasImage) set.add(e.channelId);
    }
    return set.size;
}

/**
 * Honeypot signal breakdown within `ms`.
 * @param sets {{primary:Set, secondary:Set, voice:Set}}
 * @returns {{primaryHits:number, bothSecondary:boolean, voiceHits:number}}
 */
function honeypotStats(userId, ms, now, sets) {
    const primaryHit = new Set();
    const secondaryHit = new Set();
    for (const e of windowEvents(userId, ms, now)) {
        if (sets.primary.has(e.channelId)) primaryHit.add(e.channelId);
        if (sets.secondary.has(e.channelId)) secondaryHit.add(e.channelId);
    }

    const bothSecondary = secondaryHit.size >= 2;

    // Voice extra weight only applies to honeypot channels that actually count:
    // every primary hit, plus the secondary pair only when both were hit.
    const counted = new Set(primaryHit);
    if (bothSecondary) for (const id of secondaryHit) counted.add(id);
    let voiceHits = 0;
    for (const id of counted) if (sets.voice.has(id)) voiceHits++;

    return { primaryHits: primaryHit.size, bothSecondary, voiceHits };
}

/**
 * The recent {channelId, messageId} pairs to delete on a mute — limited to a
 * short window so unrelated older history is never touched.
 */
function offendingEvents(userId, ms, now = Date.now()) {
    return windowEvents(userId, ms, now).map((e) => ({
        channelId: e.channelId,
        messageId: e.messageId,
    }));
}

/** Remove all tracked state for a user (e.g. after action). Test helper too. */
function clear(userId) {
    events.delete(userId);
}

/** Test/inspection helper. */
function _reset() {
    events.clear();
}

module.exports = {
    record,
    prune,
    pruneAll,
    windowEvents,
    distinctChannels,
    imageChannels,
    honeypotStats,
    offendingEvents,
    clear,
    _reset,
    _events: events,
};
