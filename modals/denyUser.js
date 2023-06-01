const {
    ModalBuilder,
    ChatInputCommandInteraction,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalSubmitInteraction,
    EmbedBuilder,
} = require("discord.js");

const { denyModal, denyModalReason } = require("../logic/helper");

const { getLang } = require("../lang");
const lang = process.env.LANG;

const ACCESS_REQUEST_CHANNEL_ID = process.env.ACCESS_REQUEST_CHANNEL_ID;
const GUEST_ROLE_ID = process.env.GUEST_ROLE_ID;

/**
 * @description Create a modal to interview the user
 * @param {ChatInputCommandInteraction} interaction
 */
async function create(interaction) {
    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);

    const userId = originalEmbed.data.fields.filter(
        (t) => t.name === "User ID"
    )[0].value;

    const member = await interaction.guild.members.fetch(userId);

    if (!member) {
        await interaction.reply({
            content: getLang(lang, "error_member_left_server"),
        });

        // update the embed and mark it as done
        originalEmbed.setFooter({
            text: getLang(lang, "footer_member_left_server"),
        });
        originalEmbed.setColor(0x555555);
        originalEmbed.setTimestamp(new Date().valueOf());

        await interaction.message.edit({
            embeds: [originalEmbed],
        });

        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`${denyModal}-${userId}-${interaction.message.id}`)
        .setTitle("Deny Reason");

    const denyReason = new ActionRowBuilder().setComponents(
        new TextInputBuilder()
            .setCustomId(denyModalReason)
            .setLabel("Set deny reason here. Blank for default.")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1024)
            // comment the below line to make this required
            .setRequired(false)
    );

    modal.addComponents(denyReason);

    await interaction.showModal(modal);
}

/**
 * @description Send the interview responses to a chat and give action buttons
 * @param {ModalSubmitInteraction} interaction
 */
async function respond(interaction, userId, messageId) {
    const message = await interaction.guild.channels.cache
        .get(ACCESS_REQUEST_CHANNEL_ID)
        .messages.fetch(messageId);
    const originalEmbed = EmbedBuilder.from(message.embeds[0]);
    const member = await interaction.guild.members.fetch(userId);

    if (!member) {
        await interaction.reply({
            content: getLang(lang, "error_member_left_server"),
            ephemeral: true,
        });

        // update the embed and mark it as done
        originalEmbed.setFooter({
            text: getLang(lang, "footer_member_left_server"),
        });
        originalEmbed.setColor(0x555555);
        originalEmbed.setTimestamp(new Date().valueOf());

        await message.edit({
            embeds: [originalEmbed],
        });

        return;
    }

    originalEmbed.setFooter({ text: getLang(lang, "footer_request_denied") });
    originalEmbed.setColor(0x000000);
    originalEmbed.setTimestamp(new Date().valueOf());

    await message.edit({
        embeds: [originalEmbed],
    });

    let denyReason = interaction.fields.getTextInputValue(denyModalReason);

    if (!denyReason) denyReason = getLang(lang, "default_deny_reason");

    try {
        await member.user.send({
            content: getLang(lang, "dm_deny_message", denyReason),
        });

        await interaction.reply({
            content: getLang(lang, "ephemeral_denied_dm", userId),
            ephemeral: true,
        });
    } catch (err) {
        console.log(`Unable to DM ${userId}: ${err}`);

        await interaction.reply({
            content: getLang(lang, "ephemeral_denied_no_dm", userId),
            ephemeral: true,
        });
    }
}

module.exports = {
    create,
    respond,
};
