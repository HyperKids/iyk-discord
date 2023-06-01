const { 
    ModalBuilder, 
    ChatInputCommandInteraction, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    ModalSubmitInteraction,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const {
    interviewModal,
    interviewIrlName,
    interviewHowYouKnowMe,
    interviewApprove,
    interviewDeny,

    isMemberAlready
} = require("../logic/helper");

const PRIVATE_CHANNEL_ID = process.env.PRIVATE_CHANNEL_ID;
const GUEST_ROLE_ID = process.env.GUEST_ROLE_ID;

/**
 * @description Create a modal to interview the user
 * @param {ChatInputCommandInteraction} interaction 
 */
async function create(interaction) {
    if (await isMemberAlready(interaction)) return;

    const modal = new ModalBuilder()
        .setCustomId(interviewModal)
        .setTitle("How well do you know me?");

    const irlName = new ActionRowBuilder()
        .setComponents(
            new TextInputBuilder()
                .setCustomId(interviewIrlName)
                .setLabel("What is my IRL name?")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(150)
                // comment the below line to make this required
                .setRequired(false)
                );

    const howYouKnowMe = new ActionRowBuilder()
        .setComponents(
            new TextInputBuilder()
                .setCustomId(interviewHowYouKnowMe)
                .setLabel("How do you know me?")
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(1024)
                // comment the below line to make this required
                .setRequired(false)
                );

    modal.addComponents(irlName, howYouKnowMe);

    await interaction.showModal(modal);
}

/**
 * @description Send the interview responses to a chat and give action buttons
 * @param {ModalSubmitInteraction} interaction 
 */
async function respond(interaction) {
    // send { irlName, howYouKnowMe } to private channel as an embed with a red? color, 
    // include user ID in text output, 
    // add accept/deny buttons
    if (await isMemberAlready(interaction)) return;
    
    const irlName = interaction.fields.getTextInputValue(interviewIrlName) ?? "";
    const howYouKnowMe = interaction.fields.getTextInputValue(interviewHowYouKnowMe) ?? "";

    const embed = {
        color: 0xd22b2b,
        title: "Interview response",
        author: {
            name:  `${interaction.user.username}${interaction.user.discriminator === "0" ? "" : `#${interaction.user.discriminator}`}`,
            icon_url: interaction.user.avatarURL()
        },
        fields: [
            { name: 'User ID', value: interaction.user.id },
            { name: 'Your IRL name', value: irlName },
            { name: 'How they know you', value: howYouKnowMe }
        ],
        timestamp: new Date().toISOString(),
        footer: {
            text: 'Not yet responded'
        },
    };

    const approve = new ButtonBuilder()
        .setCustomId(interviewApprove)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Primary);

    const deny = new ButtonBuilder()
        .setCustomId(interviewDeny)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder()
        .addComponents(approve, deny);

    await interaction.reply({ 
        content: 'Your response has been recorded!',
        ephemeral: true
    });

    await interaction.guild.channels.cache.get(PRIVATE_CHANNEL_ID).send({
        embeds: [embed],
        components: [row]
    });

    // assign the guest role
    await interaction.member.roles.add(GUEST_ROLE_ID);
}

module.exports = {
    create,
    respond
};