require("dotenv").config();

const {
    Client,
    Events,
    GatewayIntentBits,
    ContextMenuCommandBuilder,
    ApplicationCommandType,
} = require("discord.js");
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

    // context menu commands
    emergencyBanCommandName,
    emergencyBanModal,

    // other functions
    isMemberAlready,
} = require("./logic/helper");

const interviewQuestions = require("./modals/interviewQuestions");
const acceptUser = require("./modals/acceptUser");
const denyUser = require("./modals/denyUser");
const emergencyBan = require("./modals/emergencyBan");

const { getLang } = require("./lang");
const lang = process.env.LANG;

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);

    try {
        await readyClient.application.commands.set(
            [
                new ContextMenuCommandBuilder()
                    .setName(emergencyBanCommandName)
                    .setType(ApplicationCommandType.User)
                    // hidden from everyone by default - grant the mod role
                    // access in Server Settings > Integrations > Emergency Ban
                    .setDefaultMemberPermissions("0"),
            ],
            process.env.GUILD_ID
        );
        console.log("Guild commands registered");
    } catch (err) {
        console.error(
            `Error registering guild commands: ${err}\n${err.stack || err}`
        );
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
        try {
            switch (interaction.customId) {
                case welcomeGuest:
                    // give the user the guest role
                    if (!(await isMemberAlready(interaction, true))) {
                        await interaction.reply({
                            content: getLang(lang, "ephemeral_welcome_guest"),
                            ephemeral: true,
                        });
                    }
                    return;
                case welcomeIKnowYou:
                    await interviewQuestions.create(interaction);
                    return;
                case interviewApprove:
                    await acceptUser.respond(interaction);
                    return;
                case interviewDeny:
                    await denyUser.respond(interaction);
                    return;
            }
        } catch (err) {
            console.error(
                `Error on button interaction: ${err}\n${err.stack || err}`
            );
            return;
        }
    } else if (interaction.isModalSubmit()) {
        try {
            if (interaction.customId === interviewModal)
                return await interviewQuestions.respond(interaction);
            if (interaction.customId.startsWith(`${emergencyBanModal}:`))
                return await emergencyBan.respond(interaction);
        } catch (err) {
            console.error(
                `Error on modal interaction: ${err}\n${err.stack || err}`
            );
            return;
        }
    } else if (interaction.isUserContextMenuCommand()) {
        try {
            if (interaction.commandName === emergencyBanCommandName)
                return await emergencyBan.create(interaction);
        } catch (err) {
            console.error(
                `Error on context menu interaction: ${err}\n${err.stack || err}`
            );
            return;
        }
    } else if (interaction.isStringSelectMenu()) {
        try {

        } catch (err) {
            console.error(
                `Error on select menu interaction: ${err}\n${err.stack || err}`
            );
            return;
        }
    }
});

const http = require('http');
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('OK');
});

server.listen(port, () => {
    console.log(`Health check server listening on port ${port}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
