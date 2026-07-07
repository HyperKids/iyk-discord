const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    UserContextMenuCommandInteraction,
    ModalSubmitInteraction,
} = require("discord.js");

const {
    emergencyBanModal,
    emergencyBanPassword,
    emergencyBanReason,
} = require("../logic/helper");

const { getLang } = require("../lang");
const lang = process.env.LANG;

const MOD_ROLE_ID = process.env.MOD_ROLE_ID;
const PROTECTED_ROLE_ID = process.env.PROTECTED_ROLE_ID;
const MOD_LOG_CHANNEL_ID = process.env.MOD_LOG_CHANNEL_ID;
const MOD_ALERT_USER_ID = process.env.MOD_ALERT_USER_ID;

// null means the feature is unconfigured and stays disabled (fail closed)
let modPasswords = null;
try {
    if (process.env.MOD_PASSWORDS)
        modPasswords = JSON.parse(process.env.MOD_PASSWORDS);
} catch (err) {
    console.error(
        `MOD_PASSWORDS is not valid JSON - emergency ban is disabled: ${err}`
    );
}

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000;
const PURGE_SECONDS = 7 * 24 * 60 * 60; // Discord's maximum

// userId -> { failCount, lockedUntil } - in-memory, resets on restart
const lockouts = new Map();

function getActiveLockout(userId) {
    const entry = lockouts.get(userId);
    if (!entry) return null;

    if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
        lockouts.delete(userId);
        return null;
    }

    return entry;
}

function formatTag(user) {
    return `${user.username}${user.discriminator === "0" ? "" : `#${user.discriminator}`}`;
}

async function logToModChannel(guild, payload) {
    try {
        const channel = await guild.channels.fetch(MOD_LOG_CHANNEL_ID);
        await channel.send(payload);
    } catch (err) {
        console.error(
            `Error sending to mod log channel: ${err}\n${err.stack || err}`
        );
    }
}

/**
 * @description Validate the invoker/target and show the password modal
 * @param {UserContextMenuCommandInteraction} interaction
 */
async function create(interaction) {
    if (!interaction.member.roles.cache.has(MOD_ROLE_ID))
        return await interaction.reply({
            content: getLang(lang, "eban_error_not_authorized"),
            ephemeral: true,
        });

    const lockout = getActiveLockout(interaction.user.id);
    if (lockout && lockout.lockedUntil)
        return await interaction.reply({
            content: getLang(
                lang,
                "eban_error_locked_out",
                `<t:${Math.ceil(lockout.lockedUntil / 1000)}:R>`
            ),
            ephemeral: true,
        });

    if (!modPasswords || typeof modPasswords[interaction.user.id] !== "string")
        return await interaction.reply({
            content: getLang(lang, "eban_error_not_configured"),
            ephemeral: true,
        });

    const target = interaction.targetUser;

    if (target.id === interaction.user.id)
        return await interaction.reply({
            content: getLang(lang, "eban_error_self"),
            ephemeral: true,
        });

    if (target.bot)
        return await interaction.reply({
            content: getLang(lang, "eban_error_bot"),
            ephemeral: true,
        });

    if (interaction.targetMember?.roles.cache.has(PROTECTED_ROLE_ID))
        return await interaction.reply({
            content: getLang(lang, "eban_error_protected"),
            ephemeral: true,
        });

    const modal = new ModalBuilder()
        .setCustomId(`${emergencyBanModal}:${target.id}`)
        .setTitle(`Emergency Ban: ${target.username}`.slice(0, 45));

    const password = new ActionRowBuilder().setComponents(
        new TextInputBuilder()
            .setCustomId(emergencyBanPassword)
            .setLabel("Password")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
    );

    // max 400 keeps the audit log reason under Discord's 512 character cap
    const reason = new ActionRowBuilder().setComponents(
        new TextInputBuilder()
            .setCustomId(emergencyBanReason)
            .setLabel("Reason (optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(400)
            .setRequired(false)
    );

    modal.addComponents(password, reason);

    await interaction.showModal(modal);
}

/**
 * @description Verify the password, then ban the target and purge 7 days of their messages
 * @param {ModalSubmitInteraction} interaction
 */
async function respond(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const targetId = interaction.customId.split(":")[1];
    if (!targetId || !/^\d+$/.test(targetId))
        return await interaction.editReply({
            content: getLang(lang, "eban_error_ban_failed"),
        });

    const lockout = getActiveLockout(interaction.user.id);
    if (lockout && lockout.lockedUntil)
        return await interaction.editReply({
            content: getLang(
                lang,
                "eban_error_locked_out",
                `<t:${Math.ceil(lockout.lockedUntil / 1000)}:R>`
            ),
        });

    const expected = modPasswords?.[interaction.user.id];
    if (typeof expected !== "string")
        return await interaction.editReply({
            content: getLang(lang, "eban_error_not_configured"),
        });

    // compared exactly as entered - no trimming or case folding
    const entered = interaction.fields.getTextInputValue(emergencyBanPassword);

    if (entered !== expected) {
        const entry = lockouts.get(interaction.user.id) ?? {
            failCount: 0,
            lockedUntil: null,
        };
        entry.failCount += 1;
        lockouts.set(interaction.user.id, entry);

        // never include the guessed text in logs
        if (entry.failCount >= MAX_ATTEMPTS) {
            entry.lockedUntil = Date.now() + LOCKOUT_MS;
            const unlock = `<t:${Math.ceil(entry.lockedUntil / 1000)}:R>`;

            await logToModChannel(interaction.guild, {
                content: `<@${MOD_ALERT_USER_ID}> ⚠️ <@${interaction.user.id}> entered a wrong Emergency Ban password ${MAX_ATTEMPTS} times (target: <@${targetId}>) and is locked out until ${unlock}.`,
                allowedMentions: { users: [MOD_ALERT_USER_ID] },
            });

            return await interaction.editReply({
                content: getLang(lang, "eban_error_locked_out", unlock),
            });
        }

        await logToModChannel(interaction.guild, {
            content: `<@${interaction.user.id}> entered a wrong Emergency Ban password (attempt ${entry.failCount}/${MAX_ATTEMPTS}, target: <@${targetId}>).`,
            allowedMentions: { users: [] },
        });

        return await interaction.editReply({
            content: getLang(
                lang,
                "eban_error_wrong_password",
                MAX_ATTEMPTS - entry.failCount
            ),
        });
    }

    lockouts.delete(interaction.user.id);

    // re-check the target - things may have changed while the modal was open;
    // a missing member is fine, Discord can ban (and purge) by ID
    const targetMember = await interaction.guild.members
        .fetch(targetId)
        .catch(() => null);

    if (targetMember) {
        if (targetMember.roles.cache.has(PROTECTED_ROLE_ID))
            return await interaction.editReply({
                content: getLang(lang, "eban_error_protected"),
            });

        if (!targetMember.bannable)
            return await interaction.editReply({
                content: getLang(lang, "eban_error_hierarchy"),
            });
    }

    const reason =
        interaction.fields.getTextInputValue(emergencyBanReason) ||
        "No reason given";
    const invokerTag = formatTag(interaction.user);

    try {
        await interaction.guild.members.ban(targetId, {
            deleteMessageSeconds: PURGE_SECONDS,
            reason: `Emergency ban by ${invokerTag} (${interaction.user.id}): ${reason}`,
        });
    } catch (err) {
        console.error(`Error banning ${targetId}: ${err}\n${err.stack || err}`);
        return await interaction.editReply({
            content: getLang(
                lang,
                err.code === 50013
                    ? "eban_error_hierarchy"
                    : "eban_error_ban_failed"
            ),
        });
    }

    const targetUser =
        targetMember?.user ??
        (await interaction.client.users.fetch(targetId).catch(() => null));

    const embed = {
        color: 0xed4245,
        title: "Emergency Ban",
        fields: [
            {
                name: "Banned user",
                value: `<@${targetId}>${targetUser ? ` (${formatTag(targetUser)})` : ""} - ID ${targetId}`,
            },
            {
                name: "Banned by",
                value: `<@${interaction.user.id}> (${invokerTag})`,
            },
            { name: "Reason", value: reason },
            {
                name: "Purge",
                value: "Their messages from the last 7 days were deleted server-wide.",
            },
        ],
        timestamp: new Date().toISOString(),
    };

    await logToModChannel(interaction.guild, {
        content: `<@${MOD_ALERT_USER_ID}> Emergency Ban used.`,
        embeds: [embed],
        allowedMentions: { users: [MOD_ALERT_USER_ID] },
    });

    await interaction.editReply({
        content: getLang(lang, "eban_success", `<@${targetId}>`),
    });
}

module.exports = {
    create,
    respond,
};
