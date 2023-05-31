const { 
    ChatInputCommandInteraction
} = require("discord.js");

const GUEST_ROLE = process.env.GUEST_ROLE;

/**
 * @description Check if the user already is a member (has a role higher than guest)
 * @param {ChatInputCommandInteraction} interaction 
 * @param {Boolean} assign
 */
async function isMemberAlready(interaction, assign) {
    const guestRole = interaction.guild.roles.cache.get(GUEST_ROLE);

    let highestRole = interaction.member.roles.highest;

    if (highestRole && guestRole.position < highestRole.position) {
        // user cannot complete this, they already have a higher role
        interaction.reply({
            content: "You already have a role higher than the guest role, you cannot complete this questionaire.",
            ephemeral: true
        });

        return true;
    }

    if (assign) {
        // go ahead and give them guest
        await interaction.member.roles.add(GUEST_ROLE);
    }

    return false;
}

module.exports = {
    welcomeGuest: "welcomeguest",
    welcomeIKnowYou: "welcomeiknowyou",

    interviewModal: "interview",
    interviewIrlName: "interviewirlname",
    interviewHowYouKnowMe: "interviewhowyouknowme",
    interviewApprove: "interviewapprove",
    interviewDeny: "interviewdeny",

    acceptModal: "accept",
    acceptRole: "acceptrole",
    acceptCustomMessage: "acceptcustommessage",

    denyModal: "deny",
    denyModalReason: "denyreason",

    isMemberAlready
};