const {
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ModalSubmitInteraction,
    StringSelectMenuBuilder,
    EmbedBuilder,
    StringSelectMenuOptionBuilder,
} = require("discord.js");

const { acceptModal } = require("../logic/helper");

const { getLang } = require("../lang");
const lang = process.env.LANG;

const ACCESS_REQUEST_CHANNEL_ID = process.env.ACCESS_REQUEST_CHANNEL_ID;
const GUEST_ROLE_ID = process.env.GUEST_ROLE_ID;

const HIGHEST_ROLE_ID = process.env.HIGHEST_ROLE_ID;
const LOWEST_ROLE_ID = process.env.LOWEST_ROLE_ID;

/**
 * @description Assign role to user and update modal
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
        originalEmbed.setFooter({ text: getLang(lang, "footer_member_left_server") });
        originalEmbed.setColor(0x555555);
        originalEmbed.setTimestamp(new Date().valueOf());

        await message.edit({
            embeds: [originalEmbed],
        });

        return;
    }

    originalEmbed.setFooter({ text: getLang(lang, "footer_request_approved") });
    originalEmbed.setColor(0x50c878);
    originalEmbed.setTimestamp(new Date().valueOf());

    await message.edit({
        embeds: [originalEmbed],
    });

    await member.roles.add(process.env.VERIFIED_ROLE_ID)
    await member.roles.add(process.env.GUEST_ROLE_ID)

}

module.exports = {
    respond,
};
