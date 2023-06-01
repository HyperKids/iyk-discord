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

    const guest = new ButtonBuilder()
        .setCustomId(welcomeGuest)
        .setLabel('Guest')
        .setStyle(ButtonStyle.Secondary);

    const iKnowYou = new ButtonBuilder()
        .setCustomId(welcomeIKnowYou)
        .setLabel('I know you')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder()
        .addComponents(guest, iKnowYou);

    await welcome.send({
        content: "Welcome to the server!  Click 'Guest' if you don't know me personally, otherwise click 'I know you' to answer a few questions",
        components: [row]
    });

    console.log("We're setup!");
    process.exit();
})

client.login(process.env.DISCORD_BOT_TOKEN);