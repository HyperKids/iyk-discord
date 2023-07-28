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

const ACCESS_REQUEST_CHANNEL_ID = process.env.ACCESS_REQUEST_CHANNEL_ID;
const GUEST_ROLE_ID = process.env.GUEST_ROLE_ID;

/**
 * @description Create a modal to interview the user
 * @param {ChatInputCommandInteraction} interaction 
 */
async function create(interaction) {
    if (await isMemberAlready(interaction)) return;

    const modal = new ModalBuilder()
        .setCustomId(interviewModal)
        .setTitle("Private Channel Access Form");

    const irlName = new ActionRowBuilder()
        .setComponents(
            new TextInputBuilder()
                .setCustomId(interviewIrlName)
                .setLabel("What's your name?")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(150)
                // comment the below line to make this required
                //.setRequired(false)
                );

    const howYouKnowMe = new ActionRowBuilder()
        .setComponents(
            new TextInputBuilder()
                .setCustomId(interviewHowYouKnowMe)
                .setLabel("How do you know Isaac?")
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(512)
                // comment the below line to make this required
                //.setRequired(false)
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
        color: 0xf2cd64,
        title: "Access Request",
        author: {
            name:  `${interaction.user.username}${interaction.user.discriminator === "0" ? "" : `#${interaction.user.discriminator}`}`,
            icon_url: interaction.user.avatarURL()
        },
        fields: [
            { name: 'User ID', value: interaction.user.id },
            { name: 'Name', value: irlName + ` <@${interaction.user.id}>` },
            { name: 'How they know you', value: howYouKnowMe }
        ],
        timestamp: new Date().toISOString(),
        footer: {
            text: 'Needs action'
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
        content: 'Thanks for filling out the form - I\'ll get back to you shortly! In the meantime, I\'ve given you guest access so you can see the public channels.',
        ephemeral: true
    });

    await interaction.guild.channels.cache.get(ACCESS_REQUEST_CHANNEL_ID).send({
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