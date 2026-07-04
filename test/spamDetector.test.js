/**
 * Orchestrator integration tests using mocked discord.js objects (no gateway
 * connection). Run with `npm test` / `node test/spamDetector.test.js`.
 * Verifies event guards, dispatch routing, dedupe, the warn debounce, the
 * excluded-role warn-only path, and the defunct-role-combo member update.
 */

const assert = require("assert");

// Configure BEFORE requiring modules (config is frozen at load).
process.env.SPAM_DETECTION_ENABLED = "true";
process.env.SPAM_DRY_RUN = "true"; // non-destructive
process.env.SPAM_LOG_CHANNEL_ID = "LOG";
process.env.OWNER_USER_ID = "OWNER";
process.env.HONEYPOT_CHANNEL_IDS = "HP1,HP2,HP3";
process.env.SECONDARY_HONEYPOT_CHANNEL_IDS = "S1,S2";
process.env.HONEYPOT_VOICE_CHANNEL_IDS = "HP2,S1,S2";
process.env.EXCLUDED_ROLE_ID = "EXCL";
process.env.DEFUNCT_ROLE_A_ID = "DA";
process.env.DEFUNCT_ROLE_B_ID = "DB";
process.env.SPAM_WARN_DELAY_MS = "50";
process.env.SPAM_ACTION_COOLDOWN_MS = "100000";

const detector = require("../moderation/spamDetector");
const tracker = require("../logic/spamTracker");

// --- fakes ---
const sent = [];
const logChannel = { send: async (payload) => sent.push(payload) };
const client = {
    channels: {
        cache: { get: (id) => (id === "LOG" ? logChannel : null) },
        fetch: async (id) =>
            id === "LOG" ? logChannel : { messages: { delete: async () => {} } },
    },
};

function makeMember({ id, roles = [], staff = false, joinedTimestamp, accountCreated }) {
    const roleSet = new Set(roles);
    const user = {
        id,
        bot: false,
        createdTimestamp: accountCreated,
        username: "spammer",
        discriminator: "0",
        displayAvatarURL: () => "http://x/avatar.png",
    };
    return {
        id,
        joinedTimestamp,
        user,
        client,
        roles: { cache: { has: (r) => roleSet.has(r) } },
        permissions: { has: () => staff },
        timeout: async () => {},
    };
}

function makeMessage({ id, channelId, member, image = true, voice = false, ts }) {
    const attachments = new Map();
    if (image)
        attachments.set("1", {
            contentType: "image/png",
            name: "a.png",
            url: "http://x/a.png",
        });
    return {
        id,
        channelId,
        createdTimestamp: ts,
        guild: { members: { fetch: async () => member } },
        author: member.user,
        member,
        webhookId: null,
        system: false,
        type: 0, // Default
        attachments,
        embeds: [],
        channel: { isVoiceBased: () => voice, messages: { delete: async () => {} } },
        client,
    };
}

function resetState() {
    tracker._reset();
    detector._internals.acted.clear();
    for (const t of detector._internals.pendingWarns.values()) clearTimeout(t);
    detector._internals.pendingWarns.clear();
    sent.length = 0;
}

// The orchestrator reads Date.now() internally, so events must sit inside the
// real-time sliding window — use real "now" (windows are minutes-wide).
const NOW = Date.now();
const BURST = ["HP1", "HP2", "C3", "C4", "C5", "C6"];

const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

test("attack burst -> single dual-mention mute (dedupe + warn superseded)", async () => {
    resetState();
    const attacker = makeMember({
        id: "ATTACKER",
        joinedTimestamp: NOW - 2 * 3600000,
        accountCreated: NOW - 24 * 3600000,
    });
    for (let i = 0; i < BURST.length; i++)
        await detector.onMessage(
            makeMessage({ id: "m" + i, channelId: BURST[i], member: attacker, ts: NOW + i * 3000 })
        );
    assert.strictEqual(sent.length, 1, "exactly one action for the burst");
    assert.ok(sent[0].content.includes("<@ATTACKER>"), "mentions offender");
    assert.ok(sent[0].content.includes("<@OWNER>"), "pings owner");
});

test("staff burst -> ignored entirely", async () => {
    resetState();
    const staff = makeMember({
        id: "STAFF",
        staff: true,
        joinedTimestamp: NOW - 2 * 3600000,
        accountCreated: NOW - 24 * 3600000,
    });
    for (let i = 0; i < BURST.length; i++)
        await detector.onMessage(
            makeMessage({ id: "s" + i, channelId: BURST[i], member: staff, ts: NOW + i * 3000 })
        );
    assert.strictEqual(sent.length, 0);
});

test("excluded (verified) user burst -> warn only, no offender mention", async () => {
    resetState();
    const verified = makeMember({
        id: "VERIFIED",
        roles: ["EXCL"],
        joinedTimestamp: NOW - 2 * 3600000,
        accountCreated: NOW - 24 * 3600000,
    });
    for (let i = 0; i < BURST.length; i++)
        await detector.onMessage(
            makeMessage({ id: "v" + i, channelId: BURST[i], member: verified, ts: NOW + i * 3000 })
        );
    assert.strictEqual(sent.length, 1);
    assert.ok(!sent[0].content.includes("<@VERIFIED>"), "never mentions the excluded user");
    assert.ok(sent[0].content.includes("<@OWNER>"));
});

test("legit text cross-post by tenured member -> nothing", async () => {
    resetState();
    const legit = makeMember({
        id: "LEGIT",
        joinedTimestamp: NOW - 400 * 86400000,
        accountCreated: NOW - 400 * 86400000,
    });
    for (let i = 0; i < BURST.length; i++)
        await detector.onMessage(
            makeMessage({ id: "l" + i, channelId: "TXT" + i, member: legit, image: false, ts: NOW + i * 3000 })
        );
    assert.strictEqual(sent.length, 0);
});

test("gaining both defunct roles -> warn (warn-level, no offender mention)", async () => {
    resetState();
    const oldM = makeMember({ id: "PLANT", roles: ["DA"], joinedTimestamp: NOW - 10 * 3600000, accountCreated: NOW - 2 * 86400000 });
    const newM = makeMember({ id: "PLANT", roles: ["DA", "DB"], joinedTimestamp: NOW - 10 * 3600000, accountCreated: NOW - 2 * 86400000 });
    await detector.onMemberUpdate(oldM, newM);
    assert.strictEqual(sent.length, 1);
    assert.ok(!sent[0].content.includes("<@PLANT>"));
});

test("bot and DM messages are ignored", async () => {
    resetState();
    const attacker = makeMember({ id: "A2", joinedTimestamp: NOW - 2 * 3600000, accountCreated: NOW - 24 * 3600000 });
    const botMsg = makeMessage({ id: "b1", channelId: "HP1", member: attacker, ts: NOW });
    botMsg.author = { ...attacker.user, bot: true };
    await detector.onMessage(botMsg);
    const dmMsg = makeMessage({ id: "d1", channelId: "HP1", member: attacker, ts: NOW });
    dmMsg.guild = null;
    await detector.onMessage(dmMsg);
    assert.strictEqual(sent.length, 0);
});

// runner
(async () => {
    let passed = 0;
    let failed = 0;
    for (const { name, fn } of tests) {
        try {
            await fn();
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
})();
