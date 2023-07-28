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

const embeds = require('./embeds');

client.on(Events.ClientReady, async () => {
    const guild = client.guilds.cache.get(GUILD_ID);
    const welcome = guild.channels.cache.get(WELCOME_CHANNEL_ID);

    const iKnowYou = new ButtonBuilder()
        .setCustomId(welcomeIKnowYou)
        .setLabel('I know Isaac!')
        .setEmoji('🙋‍♂️')
        .setStyle(ButtonStyle.Secondary);

    const guest = new ButtonBuilder()
        .setCustomId(welcomeGuest)
        .setLabel('Guest')
        .setEmoji('🌟')
        .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder()
        .addComponents(guest, iKnowYou);

    await welcome.send({
        embeds: [embeds.access],
        components: [row]
    });

    console.log("Done!");
    process.exit();
})

client.login(process.env.DISCORD_BOT_TOKEN);