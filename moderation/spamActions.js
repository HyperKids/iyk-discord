/**
 * @description Side-effecting moderation actions for spam detection: warn (log +
 * ping, non-destructive) and mute (timeout + delete offending messages +
 * dual-mention log). All destructive calls are gated behind SPAM_DRY_RUN so the
 * feature can be rolled out in observe-only mode. This module NEVER bans — the
 * owner actions bans manually via the tappable mention in the log embed.
 */

const { EmbedBuilder } = require("discord.js");
const { config } = require("../logic/spamConfig");

const WARN_COLOR = 0xf2cd64; // amber (matches existing "pending" embeds)
const MUTE_COLOR = 0xe03131; // red

/** Human-readable age from a timestamp, e.g. "3d 4h" / "12m". */
function formatAge(fromMs, now) {
    if (fromMs == null) return "unknown";
    let s = Math.max(0, Math.floor((now - fromMs) / 1000));
    const d = Math.floor(s / 86400);
    s -= d * 86400;
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/** Resolve the configured log channel (cache-first, then fetch). */
async function getLogChannel(client) {
    if (!config.logChannelId) return null;
    const cached = client.channels.cache.get(config.logChannelId);
    if (cached) return cached;
    try {
        return await client.channels.fetch(config.logChannelId);
    } catch (err) {
        console.error(`[spam] cannot resolve log channel: ${err}`);
        return null;
    }
}

/** Build the shared log embed for a warn/mute event. */
function buildEmbed(member, result, { tier, dryRun, actionNote }) {
    const now = Date.now();
    const user = member.user;
    const prefix = dryRun ? "[DRY RUN] " : "";
    const isMute = tier === "mute";

    const embed = new EmbedBuilder()
        .setColor(isMute ? MUTE_COLOR : WARN_COLOR)
        .setTitle(`${prefix}${isMute ? "🔨 Spam MUTE" : "⚠️ Spam WARN"}`)
        .setAuthor({
            name: `${user.username}${
                user.discriminator && user.discriminator !== "0"
                    ? `#${user.discriminator}`
                    : ""
            }`,
            iconURL: user.displayAvatarURL(),
        })
        .addFields(
            { name: "User", value: `<@${member.id}> \`${member.id}\`` },
            {
                name: "Account age",
                value: formatAge(user.createdTimestamp, now),
                inline: true,
            },
            {
                name: "In server for",
                value: formatAge(member.joinedTimestamp, now),
                inline: true,
            },
            {
                name: "Score",
                value:
                    `identity **${result.identityScore}** + behavior ` +
                    `**${result.behaviorScore}** = **${result.total}** ` +
                    `(mute ≥ ${result.effectiveMuteThreshold.toFixed(0)})`,
            },
            {
                name: "Signals",
                value:
                    result.reasons && result.reasons.length
                        ? result.reasons.map((r) => `• ${r}`).join("\n")
                        : "—",
            }
        )
        .setTimestamp(now);

    if (actionNote) embed.setFooter({ text: actionNote });
    return embed;
}

/**
 * @description Non-destructive warn: post a log embed and ping the owner. Leaves
 * the user's messages in place.
 */
async function warn(client, member, result) {
    const channel = await getLogChannel(client);
    if (!channel) return;

    const embed = buildEmbed(member, result, {
        tier: "warn",
        dryRun: config.dryRun,
        actionNote: "Warn only — no action taken. Review manually.",
    });

    try {
        await channel.send({
            content: `<@${config.ownerUserId}>`,
            embeds: [embed],
            allowedMentions: { users: [config.ownerUserId] },
        });
    } catch (err) {
        console.error(`[spam] failed to post warn embed: ${err}`);
    }
}

/**
 * @description Destructive mute: timeout the member for the max duration, delete
 * the offending messages, and post a log embed that mentions BOTH the offender
 * (tappable, so the owner can ban with one tap) and the owner.
 * @param {Array<{channelId:string,messageId:string}>} offendingEvents
 */
async function mute(client, member, result, offendingEvents = []) {
    let timeoutOk = false;
    let timeoutErr = null;
    let deleted = 0;

    if (!config.dryRun) {
        // 1) timeout for the max supported duration
        try {
            await member.timeout(
                config.maxTimeoutMs,
                "Automated spam detection"
            );
            timeoutOk = true;
        } catch (err) {
            timeoutErr = err;
            console.error(`[spam] timeout failed for ${member.id}: ${err}`);
        }

        // 2) delete the offending burst messages (best-effort, each guarded)
        for (const { channelId, messageId } of offendingEvents) {
            try {
                const ch =
                    client.channels.cache.get(channelId) ||
                    (await client.channels.fetch(channelId));
                await ch.messages.delete(messageId);
                deleted++;
            } catch (err) {
                // already gone / missing perms / rate limited — keep going
                console.error(
                    `[spam] delete failed (${channelId}/${messageId}): ${err}`
                );
            }
        }
    }

    // 3) log with dual mention
    const channel = await getLogChannel(client);
    if (!channel) return;

    let note;
    if (config.dryRun) {
        note = `Would timeout for max duration and delete ${offendingEvents.length} msg(s). Bot never bans — action manually.`;
    } else if (timeoutOk) {
        note = `Muted (max duration) · deleted ${deleted}/${offendingEvents.length} msg(s). Bot never bans — tap the mention to action.`;
    } else {
        note = `⚠️ TIMEOUT FAILED (${
            timeoutErr ? timeoutErr.message : "unknown"
        }) — deleted ${deleted}/${offendingEvents.length}. Action manually.`;
    }

    const embed = buildEmbed(member, result, {
        tier: "mute",
        dryRun: config.dryRun,
        actionNote: note,
    });

    try {
        await channel.send({
            // Offender mention first (tappable to ban), then owner ping.
            content: `<@${member.id}> <@${config.ownerUserId}>`,
            embeds: [embed],
            allowedMentions: { users: [member.id, config.ownerUserId] },
        });
    } catch (err) {
        console.error(`[spam] failed to post mute embed: ${err}`);
    }
}

module.exports = {
    warn,
    mute,
    // exported for tests / reuse
    formatAge,
    buildEmbed,
};
