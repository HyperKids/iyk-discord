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
 * @description Create a modal to decide what role to give the user
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
            ephemeral: true,
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

    const highestRolePosition =
        interaction.guild.roles.cache.get(HIGHEST_ROLE_ID);
    const lowestRolePosition =
        interaction.guild.roles.cache.get(LOWEST_ROLE_ID);

    const roleChoice = new ActionRowBuilder().setComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${acceptModal}-${userId}-${interaction.message.id}`)
            .setPlaceholder("Role")
            .addOptions(
                interaction.guild.roles.cache
                    .filter(
                        (t) =>
                            t.position >= lowestRolePosition.position &&
                            t.position <= highestRolePosition.position
                    )
                    .map((t) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(t.name)
                            .setValue(t.id)
                    )
            )
    );

    await interaction.reply({
        content: `Select the role to assign <@${userId}>`,
        components: [roleChoice],
        ephemeral: true,
    });
}

/**
 * @description Assign the role to the user and DM them
 * @param {ModalSubmitInteraction} interaction
 */
async function respond(interaction, userId, messageId) {
    const selectedRoleId = interaction.values[0];

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

    await member.roles.add(selectedRoleId);
    await member.roles.remove(GUEST_ROLE_ID);

    try {
        await member.user.send({
            content: getLang(lang, "dm_approve_message"),
        });

        await interaction.reply({
            content: getLang(lang, "ephemeral_approved_dm", userId),
            ephemeral: true,
        });
    } catch (err) {
        console.log(`Unable to DM ${userId}: ${err}`);

        await interaction.reply({
            content: getLang(lang, "ephemeral_approved_no_dm", userId),
            ephemeral: true,
        });
    }
}

module.exports = {
    create,
    respond,
};
