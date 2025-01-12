import os
from dotenv import load_dotenv
import discord
import asyncio

# Load environment variables
print("Current working directory:", os.getcwd())
load_dotenv()

# Debug: Print all environment variables (masked token for security)
token_debug = os.getenv('DISCORD_TOKEN')
if token_debug:
    masked_token = token_debug[:10] + '...' + token_debug[-10:]
else:
    masked_token = None
print("Environment variables:", {
    'DISCORD_TOKEN': masked_token,
    'CHANNEL_ID': os.getenv('CHANNEL_ID')
})

# Get values from .env with error handling
TOKEN = os.getenv('DISCORD_TOKEN')
CHANNEL_ID = os.getenv('CHANNEL_ID')

if not TOKEN or not CHANNEL_ID:
    raise ValueError("Missing required environment variables. Make sure DISCORD_TOKEN and CHANNEL_ID are set in .env file")

try:
    CHANNEL_ID = int(CHANNEL_ID)
except ValueError:
    raise ValueError(f"CHANNEL_ID must be a number, got: {CHANNEL_ID}")

# Set up intents
intents = discord.Intents.default()
intents.message_content = True
intents.messages = True

async def main():
    client = discord.Client(intents=intents)
    
    @client.event
    async def on_ready():
        print(f'Logged in as {client.user}')
        
        try:
            channel = client.get_channel(CHANNEL_ID)
            if channel is None:
                print(f"Couldn't find channel with ID {CHANNEL_ID}")
                await client.close()
                return

            print(f"Found channel: {channel.name}")
            
            # Get last 5 messages
            async for message in channel.history(limit=5):
                print(f"\nMessage from {message.author}:")
                print(f"Content: {message.content}")
                
                # List attachments if any
                if message.attachments:
                    print("Attachments:")
                    for attachment in message.attachments:
                        print(f"- {attachment.filename}")
        
        except Exception as e:
            print(f"Error: {e}")
        finally:
            await client.close()

    try:
        await client.start(TOKEN)
    except discord.LoginFailure as e:
        print("Failed to log in. Please check your token. Common issues:")
        print("1. Token might be invalid or expired")
        print("2. Make sure you're using the bot token, not the client secret")
        print("3. Bot might need to be added to the server")
        print(f"Error details: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    asyncio.run(main())

