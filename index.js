require("dotenv").config();

const { Client, Events, GatewayIntentBits } = require('discord.js');
const {
    // buttons
    welcomeGuest,
    welcomeIKnowYou,

    interviewApprove,
    interviewDeny,

    // modals
    interviewModal,
    acceptModal,
    denyModal,

    // other functions
    isMemberAlready
} = require("./logic/helper");

const interviewQuestions = require("./modals/interviewQuestions");
const acceptUser = require("./modals/acceptUser");
const denyUser = require("./modals/denyUser");

const { getLang } = require("./lang");
const lang = process.env.LANG;

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds
    ]
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
        switch (interaction.customId) {
            case welcomeGuest:
                // give the user the guest role
                if (!await isMemberAlready(interaction, true)) {
                    await interaction.reply({
                        content: getLang(lang, "ephemeral_welcome_guest"),
                        ephemeral: true
                    });
                }
                return;
            case welcomeIKnowYou:
                await interviewQuestions.create(interaction);
                return;
            case interviewApprove:
                await acceptUser.create(interaction);
                return;
            case interviewDeny:
                await denyUser.create(interaction);
                return;
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === interviewModal) return await interviewQuestions.respond(interaction);
        if (interaction.customId.indexOf(denyModal + "-") === 0) {
            const parts = interaction.customId.split("-");
            return await denyUser.respond(interaction, parts[1], parts[2]);
        }
    } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId.indexOf(acceptModal + "-") === 0) {
            const parts = interaction.customId.split("-");
            return await acceptUser.respond(interaction, parts[1], parts[2]);
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);