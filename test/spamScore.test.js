/**
 * Lightweight test runner (no framework). Run with: `npm test` / `node test/spamScore.test.js`.
 * Covers the pure scoring + snowflake helpers and the sliding-window tracker.
 * Exits non-zero if any assertion fails.
 */

const assert = require("assert");

const {
    snowflakeToTimestamp,
    membershipMultiplier,
    scoreMessage,
    DISCORD_EPOCH,
    HOUR_MS,
    DAY_MS,
} = require("../logic/spamScore");
const tracker = require("../logic/spamTracker");

const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

// Fixed reference "now" so windows are deterministic.
const NOW = 1750000000000;

// ---------------------------------------------------------------------------
// snowflake
// ---------------------------------------------------------------------------
test("snowflakeToTimestamp decodes the Discord epoch offset", () => {
    // id = (ms - epoch) << 22 ; pick ms = epoch + 1000
    const id = (BigInt(1000) << 22n).toString();
    assert.strictEqual(snowflakeToTimestamp(id), DISCORD_EPOCH + 1000);
});

test("snowflakeToTimestamp handles a real-looking snowflake", () => {
    // 175928847299117063 is Discord's documented example -> 2016-04-30T11:18:25.796Z
    const ts = snowflakeToTimestamp("175928847299117063");
    assert.strictEqual(ts, 1462015105796);
    assert.strictEqual(new Date(ts).toISOString(), "2016-04-30T11:18:25.796Z");
});

// ---------------------------------------------------------------------------
// membership multiplier
// ---------------------------------------------------------------------------
test("membershipMultiplier scales with tenure", () => {
    assert.strictEqual(membershipMultiplier(1), 1.0);
    assert.strictEqual(membershipMultiplier(48), 1.3);
    assert.strictEqual(membershipMultiplier(24 * 10), 1.8);
    assert.strictEqual(membershipMultiplier(24 * 90), 3.0);
    assert.strictEqual(membershipMultiplier(null), 1.0);
});

// ---------------------------------------------------------------------------
// scoring: the attack
// ---------------------------------------------------------------------------
test("attack (new acct, honeypot + image burst) -> mute", () => {
    const r = scoreMessage({
        now: NOW,
        accountCreatedMs: NOW - 1 * DAY_MS, // < 7d
        joinedAtMs: NOW - 2 * HOUR_MS, // < 24h
        imageChannels5m: 2,
        distinctChannels1m: 6,
        primaryHoneypotHits5m: 2,
        voiceHoneypotHits5m: 2,
    });
    assert.strictEqual(r.action, "mute");
    assert.ok(r.gate, "gate should be met");
    assert.ok(r.total >= r.effectiveMuteThreshold);
});

test("honeypot + 2 image channels alone clears mute for a new account", () => {
    const r = scoreMessage({
        now: NOW,
        accountCreatedMs: NOW - 3 * DAY_MS,
        joinedAtMs: NOW - 5 * HOUR_MS,
        imageChannels5m: 2,
        primaryHoneypotHits5m: 1,
    });
    assert.strictEqual(r.action, "mute");
});

// ---------------------------------------------------------------------------
// scoring: legitimate behaviour must NOT trip
// ---------------------------------------------------------------------------
test("text cross-post by established member -> none", () => {
    const r = scoreMessage({
        now: NOW,
        accountCreatedMs: NOW - 400 * DAY_MS,
        joinedAtMs: NOW - 400 * DAY_MS,
        imageChannels5m: 0,
        distinctChannels1m: 6,
    });
    assert.strictEqual(r.action, "none");
});

test("slow 2-image post by tenured member -> none (gate not met)", () => {
    const r = scoreMessage({
        now: NOW,
        accountCreatedMs: NOW - 400 * DAY_MS,
        joinedAtMs: NOW - 400 * DAY_MS,
        imageChannels5m: 2,
        distinctChannels1m: 2,
    });
    assert.strictEqual(r.gate, false);
    assert.strictEqual(r.action, "none");
});

test("brand-new member dropping 2 images in 2 channels -> not muted (gate blocks)", () => {
    const r = scoreMessage({
        now: NOW,
        accountCreatedMs: NOW - 1 * DAY_MS,
        joinedAtMs: NOW - 2 * HOUR_MS,
        imageChannels5m: 2,
        distinctChannels1m: 2, // no burst, no honeypot -> gate false
    });
    assert.notStrictEqual(r.action, "mute");
});

// ---------------------------------------------------------------------------
// scoring: warns
// ---------------------------------------------------------------------------
test("two primary honeypots -> at least a warn", () => {
    const r = scoreMessage({
        now: NOW,
        accountCreatedMs: NOW - 400 * DAY_MS,
        joinedAtMs: NOW - 400 * DAY_MS,
        primaryHoneypotHits5m: 2,
    });
    assert.ok(r.action === "warn" || r.action === "mute");
});

test("both secondary honeypots -> warn", () => {
    const r = scoreMessage({
        now: NOW,
        accountCreatedMs: NOW - 400 * DAY_MS,
        joinedAtMs: NOW - 400 * DAY_MS,
        bothSecondaryHoneypots: true,
        voiceHoneypotHits5m: 2,
    });
    assert.ok(r.action === "warn" || r.action === "mute");
});

test("new account + both defunct roles (no posts) -> identity warn", () => {
    const r = scoreMessage({
        now: NOW,
        accountCreatedMs: NOW - 2 * DAY_MS,
        joinedAtMs: NOW - 10 * HOUR_MS,
        hasBothDefunctRoles: true,
    });
    assert.strictEqual(r.action, "warn");
    assert.strictEqual(r.warnSource, "identity");
});

test("defunct-role signal can be disabled", () => {
    const base = {
        now: NOW,
        accountCreatedMs: NOW - 2 * DAY_MS,
        joinedAtMs: NOW - 10 * HOUR_MS,
        hasBothDefunctRoles: true,
    };
    const off = scoreMessage(base, { defunctRoleSignalEnabled: false });
    // Without the defunct bonus: account<7d(+4) + joined<24h(+2) = 6 -> still a
    // borderline identity warn, but the defunct-specific +7 is gone.
    const on = scoreMessage(base, { defunctRoleSignalEnabled: true });
    assert.ok(on.identityScore - off.identityScore === 7);
});

test("membership scaling raises the mute bar for tenured members", () => {
    const ctx = {
        now: NOW,
        accountCreatedMs: NOW - 400 * DAY_MS,
        imageChannels5m: 3,
        distinctChannels1m: 4,
        primaryHoneypotHits5m: 1,
    };
    const newMember = scoreMessage({ ...ctx, joinedAtMs: NOW - 2 * HOUR_MS });
    const oldMember = scoreMessage({ ...ctx, joinedAtMs: NOW - 400 * DAY_MS });
    assert.ok(oldMember.effectiveMuteThreshold > newMember.effectiveMuteThreshold);
});

// ---------------------------------------------------------------------------
// tracker: sliding windows (time-injected)
// ---------------------------------------------------------------------------
const SETS = {
    primary: new Set(["P1", "P2", "P3"]),
    secondary: new Set(["S1", "S2"]),
    voice: new Set(["P2", "P3", "S1", "S2"]),
};

test("tracker counts distinct channels within a window", () => {
    tracker._reset();
    const u = "user-a";
    tracker.record(u, { channelId: "c1", messageId: "m1" }, NOW - 10000);
    tracker.record(u, { channelId: "c2", messageId: "m2" }, NOW - 8000);
    tracker.record(u, { channelId: "c2", messageId: "m3" }, NOW - 5000);
    tracker.record(u, { channelId: "c3", messageId: "m4" }, NOW - 1000);
    assert.strictEqual(tracker.distinctChannels(u, 60000, NOW), 3);
});

test("tracker window excludes stale events", () => {
    tracker._reset();
    const u = "user-b";
    tracker.record(u, { channelId: "c1", messageId: "m1" }, NOW - 120000); // 2m old
    tracker.record(u, { channelId: "c2", messageId: "m2" }, NOW - 5000);
    assert.strictEqual(tracker.distinctChannels(u, 60000, NOW), 1);
});

test("tracker imageChannels only counts image events", () => {
    tracker._reset();
    const u = "user-c";
    tracker.record(u, { channelId: "c1", messageId: "m1", hasImage: true }, NOW - 4000);
    tracker.record(u, { channelId: "c2", messageId: "m2", hasImage: false }, NOW - 3000);
    tracker.record(u, { channelId: "c3", messageId: "m3", hasImage: true }, NOW - 2000);
    assert.strictEqual(tracker.imageChannels(u, 300000, NOW), 2);
});

test("tracker honeypotStats: primary hits + voice extra", () => {
    tracker._reset();
    const u = "user-d";
    tracker.record(u, { channelId: "P1", messageId: "m1" }, NOW - 4000);
    tracker.record(u, { channelId: "P2", messageId: "m2" }, NOW - 3000); // voice
    const s = tracker.honeypotStats(u, 300000, NOW, SETS);
    assert.strictEqual(s.primaryHits, 2);
    assert.strictEqual(s.bothSecondary, false);
    assert.strictEqual(s.voiceHits, 1); // only P2 is voice
});

test("tracker honeypotStats: both secondary required, both are voice", () => {
    tracker._reset();
    const u = "user-e";
    tracker.record(u, { channelId: "S1", messageId: "m1" }, NOW - 4000);
    // only one secondary so far
    let s = tracker.honeypotStats(u, 300000, NOW, SETS);
    assert.strictEqual(s.bothSecondary, false);
    assert.strictEqual(s.voiceHits, 0); // S1 not counted until both hit
    tracker.record(u, { channelId: "S2", messageId: "m2" }, NOW - 2000);
    s = tracker.honeypotStats(u, 300000, NOW, SETS);
    assert.strictEqual(s.bothSecondary, true);
    assert.strictEqual(s.voiceHits, 2); // S1 + S2 both voice, now counted
});

test("tracker offendingEvents returns channel+message pairs in window", () => {
    tracker._reset();
    const u = "user-f";
    tracker.record(u, { channelId: "c1", messageId: "m1" }, NOW - 200000); // 3.3m old
    tracker.record(u, { channelId: "c2", messageId: "m2" }, NOW - 5000);
    const recent = tracker.offendingEvents(u, 120000, NOW); // last 2m
    assert.strictEqual(recent.length, 1);
    assert.deepStrictEqual(recent[0], { channelId: "c2", messageId: "m2" });
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
    try {
        fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL ${name}`);
        console.error(`       ${err.message}`);
    }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
