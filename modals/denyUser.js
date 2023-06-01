const { 
    ModalBuilder, 
    ChatInputCommandInteraction, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    ModalSubmitInteraction,
    EmbedBuilder
} = require("discord.js");

const {
    denyModal,
    denyModalReason
} = require("../logic/helper");

const ACCESS_REQUEST_CHANNEL_ID = process.env.ACCESS_REQUEST_CHANNEL_ID;
const GUEST_ROLE_ID = process.env.GUEST_ROLE_ID;

/**
 * @description Create a modal to interview the user
 * @param {ChatInputCommandInteraction} interaction 
 */
async function create(interaction) {
    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);

    const userId = originalEmbed.data.fields.filter(t => t.name === "User ID")[0].value;

    const member = await interaction.guild.members.fetch(userId);

    if (!member) {
        await interaction.reply({ content: "This user has left the server" });

        // update the embed and mark it as done
        originalEmbed.setFooter({ text: "User left the server" });
        originalEmbed.setColor(0x555555);
        originalEmbed.setTimestamp(new Date().valueOf());

        await interaction.message.edit({
            embeds: [originalEmbed]
        });

        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`${denyModal}-${userId}-${interaction.message.id}`)
        .setTitle("Send a custom deny reason?");

    const denyReason = new ActionRowBuilder()
        .setComponents(
            new TextInputBuilder()
                .setCustomId(denyModalReason)
                .setLabel("Leave blank to send default")
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
    const message = await interaction.guild.channels.cache.get(ACCESS_REQUEST_CHANNEL_ID).messages.fetch(messageId);
    const originalEmbed = EmbedBuilder.from(message.embeds[0]);
    const member = await interaction.guild.members.fetch(userId);

    if (!member) {
        await interaction.reply({ content: "This user has left the server" });

        // update the embed and mark it as done
        originalEmbed.setFooter({ text: "User left the server" });
        originalEmbed.setColor(0x555555);
        originalEmbed.setTimestamp(new Date().valueOf());

        await message.edit({
            embeds: [originalEmbed]
        });

        return;
    }

    originalEmbed.setFooter({ text: "Denied" });
    originalEmbed.setColor(0x000000);
    originalEmbed.setTimestamp(new Date().valueOf());

    await message.edit({
        embeds: [originalEmbed]
    });

    let denyReason = interaction.fields.getTextInputValue(denyModalReason);

    if (!denyReason) denyReason = "You've been denied access.";
    
    try {
        await member.user.send({
            content: denyReason
        });

        await interaction.reply({
            content: `Denied the user <@${userId}> and DM'd them successfully`
        });
    } catch (err) {
        console.log(`Unable to DM ${userId}: ${err}`);

        await interaction.reply({
            content: `Denied the user <@${userId}> but was unable to DM them`
        });
    }
}

module.exports = {
    create,
    respond
};