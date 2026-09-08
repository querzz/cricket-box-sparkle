const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

export const serverConfig = {
  botToken: process.env["TELEGRAM_BOT_TOKEN"],
  botUsername: process.env["TELEGRAM_BOT_USERNAME"] ?? "CricketBoxBot",
  botId: Number(process.env["TELEGRAM_BOT_ID"] ?? "8666427097"),
  channelId: process.env["TELEGRAM_CHANNEL_ID"],
  appUrl: process.env["APP_URL"] ?? "http://localhost:8081",
  databaseUrl: process.env["DATABASE_URL"],
};

export function requireBotToken(): string {
  return required("TELEGRAM_BOT_TOKEN", serverConfig.botToken);
}

export function requireTelegramChannelId(): string {
  return required("TELEGRAM_CHANNEL_ID", serverConfig.channelId);
}

export function requireDatabaseUrl(): string {
  return required("DATABASE_URL", serverConfig.databaseUrl);
}

export function isProductionApp(): boolean {
  return /^https:\/\//i.test(serverConfig.appUrl);
}
