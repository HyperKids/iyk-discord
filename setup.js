require("dotenv").config();

const { Client, Events, GatewayIntentBits, ButtonStyle, ButtonBuilder, ActionRowBuilder } = require('discord.js');
const {
    welcomeGuest,
    welcomeIKnowYou
} = require("./logic/helper");

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds
    ]
});

const GUILD_ID = process.env.GUILD_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

client.on(Events.ClientReady, async () => {
    const guild = client.guilds.cache.get(GUILD_ID);
    const welcome = guild.channels.cache.get(WELCOME_CHANNEL_ID);

    const iKnowYou = new ButtonBuilder()
        .setCustomId(welcomeIKnowYou)
        .setLabel('I know Isaac!')
        .setStyle(ButtonStyle.Primary);

    const guest = new ButtonBuilder()
        .setCustomId(welcomeGuest)
        .setLabel('Guest')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder()
        .addComponents(iKnowYou, guest);

    await welcome.send({
        content: "**Access Level**\nIf you know me IRL or from another server, click `I know Isaac!` to get access to the rest of the server. Otherwise, click `Guest` to access the public channels.",
        components: [row]
    });

    console.log("Done!");
    process.exit();
})

client.login(process.env.DISCORD_BOT_TOKEN);