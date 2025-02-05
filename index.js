import { Client, GatewayIntentBits, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import Moralis from 'moralis';

const port = process.env.PORT || 3000;




dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const API_KEY = process.env.API_KEY;
let chanelId = '';
let embedMessageId = ''; // Track the embed message ID
const PREFIX = '/';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

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

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'check_price') {
            const address = interaction.fields.getTextInputValue('crypto_address') || null;

            let tokenName = await getTokenName(address);
            let tokenPrice = await getTokenPrice(address);

            const channel = await client.channels.fetch(chanelId);

            const refreshButton = new ButtonBuilder()
                .setCustomId(`refresh_price_${address}`)
                .setLabel('🔄 Refresh Price')
                .setStyle(ButtonStyle.Primary);

            const buttonRow = new ActionRowBuilder().addComponents(refreshButton);

            try {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`${tokenName}`)
                    .setAuthor({ name: 'New Coin Added! 🚀' })
                    .addFields({ name: 'Price Now', value: `$${tokenPrice}`, inline: true })
                    .setFooter({ text: `Address: ${address}` })
                    .setTimestamp();

                const sentMessage = await channel.send({ embeds: [embed], components: [buttonRow] });
                embedMessageId = sentMessage.id; // Store the message ID
            } catch (error) {
                console.error(`Error sending message to Discord: ${error.message}`);
            }
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('refresh_price_')) {
        console.log("Button clicked! Custom ID:", interaction.customId); // Log button customId

        await interaction.deferUpdate();

        

        try {
            const cryptoAddress = interaction.customId.replace('refresh_price_', '');
        
            const tokenName = await getTokenName(cryptoAddress);
            let newTokenPrice = await getTokenPrice(cryptoAddress);
        
            const updatedEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`${tokenName}`)
                .setDescription(`Updated price of **${tokenName}**:`)
                .addFields({ name: 'Price Now', value: `$${newTokenPrice}`, inline: true })
                .setFooter({ text: `Address: ${cryptoAddress}` })
                .setTimestamp();
        
            if (interaction.message) {
                await interaction.message.edit({ embeds: [updatedEmbed] });
                console.log('Updated embed sent');
            } else {
                console.error("No message found to edit.");
            }
        
            // Set interval to update price every 2 minutes
            setInterval(async () => {
                try {
                    let newPrice = await getTokenPrice(cryptoAddress);
                    const updatedEmbedInterval = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle(`${tokenName}`)
                        .setDescription(`Auto-updated price of **${tokenName}**:`)
                        .addFields({ name: 'Price Now', value: `$${newPrice}`, inline: true })
                        .setFooter({ text: `Address: ${cryptoAddress}` })
                        .setTimestamp();
        
                    if (interaction.message) {
                        await interaction.message.edit({ embeds: [updatedEmbedInterval] });
                        console.log(`Price updated for ${cryptoAddress}`);
                    }
                } catch (error) {
                    console.error('Error auto-updating token price:', error);
                }
            }, 5 * 60 * 1000); // Updates every 2 minutes
        
        } catch (error) {
            console.error('Error handling refresh price interaction:', error);
            await interaction.followUp({
                content: 'There was an issue updating the price. Please try again later.',
                ephemeral: true,
            });
        }
        
    }
});

// Helper functions
const options = {
    method: 'GET',
    headers: {
        accept: 'application/json',
        'X-API-Key': API_KEY,
    },
};

async function getTokenName(tokenAddress) {
    try {
        const response = await fetch(`https://solana-gateway.moralis.io/token/mainnet/${tokenAddress}/metadata`, options);
        if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);
        const data = await response.json();
        return data.name;
    } catch (error) {
        console.error("Error fetching token data:", error.message);
    }
}

async function getTokenPrice(tokenAddress) {
    try {
        if (!Moralis.Core.isStarted) {
            await Moralis.start({ apiKey: process.env.API_KEY });
        }

        const response = await Moralis.SolApi.token.getTokenPrice({
            network: "mainnet",
            address: tokenAddress
        });

        return response.raw.usdPrice;
    } catch (error) {
        console.error("Error fetching token price:", error.message);
        return null;
    }
}

client.login(TOKEN);
