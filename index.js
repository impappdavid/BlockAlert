import { Client, GatewayIntentBits, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import Moralis from 'moralis';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const API_KEY = process.env.API_KEY;
let chanelId = '';
const PREFIX = '/';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

let db;
(async () => {
    db = await open({ filename: 'alerts.db', driver: sqlite3.Database });
    await db.run("CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, userId TEXT, crypto TEXT, address TEXT, priceAlert REAL)");
})();

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands();
});

async function registerCommands() {
    const commands = [{ name: 'check', description: 'Check price by address' }];
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Slash command registered.');
}

client.on('interactionCreate', async interaction => {
    // Check if it's a slash command
    if (interaction.isCommand()) {
        if (interaction.commandName === 'check') {
            chanelId = interaction.channel.id;

            const modal = new ModalBuilder()
                .setCustomId('check_price')
                .setTitle('Check price by address');

            const addressInput = new TextInputBuilder()
                .setCustomId('crypto_address')
                .setLabel("Contract Address (optional)")
                .setStyle(TextInputStyle.Short);

            const firstRow = new ActionRowBuilder().addComponents(addressInput);

            modal.addComponents(firstRow);

            await interaction.showModal(modal);
        }
    }

    // Check if it's a modal submit interaction
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'check_price') {
            const address = interaction.fields.getTextInputValue('crypto_address') || null;

            let tokenName = await getTokenName(address);
            let tokenPrice = await getTokenPrice(address);

            const channel = await client.channels.fetch(chanelId);

            // Refresh Price Button
            const refreshButton = new ButtonBuilder()
                .setCustomId(`refresh_price_${address}`)
                .setLabel('🔄 Refresh Price')
                .setStyle(ButtonStyle.Primary);

            const buttonRow = new ActionRowBuilder().addComponents(refreshButton);

            try {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00') // Green color
                    .setTitle(`${tokenName}`)
                    .setAuthor({ name: 'New Coin Added! 🚀' })
                    .addFields({ name: 'Price Now', value: `$${tokenPrice}`, inline: true })
                    .setFooter({ text: `Address: ${address}` })
                    .setTimestamp();

                await channel.send({ embeds: [embed], components: [buttonRow] });
            } catch (error) {
                console.error(`Error sending message to Discord: ${error.message}`);
            }
        }
    }

    // Check if it's a button interaction
    if (interaction.isButton() && interaction.customId.startsWith('refresh_price_')) {
        console.log("Button clicked! Custom ID:", interaction.customId); // Log button customId

        // Defer the interaction immediately to prevent timeout errors
        await interaction.deferUpdate();

        try {
            // Extract the crypto address from the custom ID
            const cryptoAddress = interaction.customId.replace('refresh_price_', '');
            console.log('Crypto Address:', cryptoAddress); // Log the extracted address

            const tokenName = await getTokenName(cryptoAddress);
            let newTokenPrice = await getTokenPrice(cryptoAddress);

            const updatedEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`${tokenName}`)
                .setDescription(`Updated price of **${tokenName}**:`)
                .addFields({ name: 'Price Now', value: `$${newTokenPrice}`, inline: true })
                .setFooter({ text: `Address: ${cryptoAddress}` })
                .setTimestamp();

            console.log("Attempting to edit the message...");

            // Ensure interaction.message is available before editing
            if (interaction.message) {
                // Edit the original message with the new embed
                await interaction.message.edit({ embeds: [updatedEmbed] });
                console.log('Updated embed sent');
            } else {
                console.error("No message found to edit.");
            }
        } catch (error) {
            console.error('Error handling refresh price interaction:', error);
            // Send a follow-up message in case of failure
            await interaction.followUp({
                content: 'There was an issue updating the price. Please try again later.',
                ephemeral: true,
            });
        }
    }
});


// Helper functions for fetching token name and price
const options = {
    method: 'GET',
    headers: {
        accept: 'application/json',
        'X-API-Key': API_KEY,
    },
};

async function getTokenName(tokenAddress) {
    try {
        const response = await fetch(
            `https://solana-gateway.moralis.io/token/mainnet/${tokenAddress}/metadata`,
            options
        );

        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }

        const data = await response.json(); // Parse JSON
        console.log("Full Response:", data); // Debugging

        if (!data || !data.name) {
            throw new Error("Token data is missing or does not have a name field");
        }

        console.log("Token Name:", data.name);
        return data.name;

    } catch (error) {
        console.error("Error fetching token data:", error.message);
    }
}// Initialize Moralis globally (only once) - Make sure this is called before any API calls.
async function initializeMoralis() {
    try {
        // Initialize Moralis with your API key
        await Moralis.start({
            apiKey: process.env.API_KEY // Ensure the API_KEY is properly loaded from environment variables
        });
        console.log('Moralis initialized successfully');
    } catch (error) {
        console.error('Error initializing Moralis:', error.message);
    }
}

// Fetch the token price with the Moralis API
async function getTokenPrice(tokenAddress) {
    try {
        // Ensure Moralis is initialized first
        if (!Moralis.Core.isStarted) {
            await initializeMoralis();
        }

        // Fetch the token price from the API
        const response = await Moralis.SolApi.token.getTokenPrice({
            network: "mainnet",
            address: tokenAddress
        });

        console.log("Token Price Response:", response); // Debugging the response

        // Check if the response contains the required data
        if (!response || !response.raw || !response.raw.usdPrice) {
            throw new Error("Token price data is missing or invalid");
        }

        console.log("Token Price:", response.raw.usdPrice); // Log the token price
        return response.raw.usdPrice;

    } catch (error) {
        console.error("Error fetching token price:", error.message);
        return null; // Return null in case of an error
    }
}


client.login(TOKEN);
