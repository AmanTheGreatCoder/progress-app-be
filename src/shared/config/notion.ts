import { Client } from '@notionhq/client';

export const notion = new Client({ auth: process.env.NOTION_TOKEN });
export const DATABASE_ID = process.env.NOTION_DATABASE_ID!;
