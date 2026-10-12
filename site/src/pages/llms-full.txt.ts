import type { APIRoute } from 'astro';
import { llmsFull } from '../llms';

export const GET: APIRoute = async ({ site }) =>
	new Response(await llmsFull(site!), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
