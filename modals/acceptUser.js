const { 
    ModalBuilder, 
    ChatInputCommandInteraction, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    ModalSubmitInteraction,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    StringSelectMenuOptionBuilder
} = require("discord.js");

const {
    acceptModal
} = require("../logic/helper");

const PRIVATE_CHANNEL_ID = process.env.PRIVATE_CHANNEL_ID;
const GUEST_ROLE_ID = process.env.GUEST_ROLE_ID;

const HIGHEST_ROLE_ID = process.env.HIGHEST_ROLE_ID;
const LOWEST_ROLE_ID = process.env.LOWEST_ROLE_ID;

/**
 * @description Create a modal to decide what role to give the user
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

    const highestRolePosition = interaction.guild.roles.cache.get(HIGHEST_ROLE_ID);
    const lowestRolePosition = interaction.guild.roles.cache.get(LOWEST_ROLE_ID);

    const roleChoice = new ActionRowBuilder()
        .setComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`${acceptModal}-${userId}-${interaction.message.id}`)
                .setPlaceholder("What role should they get")
                .addOptions(
                    interaction.guild.roles.cache
                        .filter(t => t.position >= lowestRolePosition.position && t.position <= highestRolePosition.position)
                        .map(t => 
                            new StringSelectMenuOptionBuilder()
                                .setLabel(t.name)
                                .setValue(t.id))
                ));

    await interaction.reply({
        content: `Select the role to assign <@${userId}>?`,
        components: [roleChoice],
        ephemeral: true
    });
}

/**
 * @description Assign the role to the user and DM them
 * @param {ModalSubmitInteraction} interaction 
 */
async function respond(interaction, userId, messageId) {
    const selectedRoleId = interaction.values[0];

    const message = await interaction.guild.channels.cache.get(PRIVATE_CHANNEL_ID).messages.fetch(messageId);
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

    originalEmbed.setFooter({ text: "Complete" });
    originalEmbed.setColor(0x50c878);
    originalEmbed.setTimestamp(new Date().valueOf());

    await message.edit({
        embeds: [originalEmbed]
    });

    await member.roles.add(selectedRoleId);
    await member.roles.remove(GUEST_ROLE_ID);

    try {
        await member.user.send({
            content: "Thanks for reaching out!  You've been approved!"
        });

        await interaction.reply({
            content: `Approved the user <@${userId}> and DM'd them successfully`
        });
    } catch (err) {
        console.log(`Unable to DM ${userId}: ${err}`);

        await interaction.reply({
            content: `Approved the user <@${userId}> but was unable to DM them`
        });
    }
}

module.exports = {
    create,
    respond
};