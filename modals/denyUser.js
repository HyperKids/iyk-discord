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

/**
 * @description Create a modal to interview the user
 * @param {ChatInputCommandInteraction} interaction
 */
async function respond(interaction) {
    await interaction.deferUpdate()
    
    const message = interaction.message;
    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);

    const userId = originalEmbed.data.fields.filter(
        (t) => t.name === "User ID"
    )[0].value;

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

}

module.exports = {
    respond,
};
