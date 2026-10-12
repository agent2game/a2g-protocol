import type { APIRoute } from 'astro';
import { llmsIndex } from '../llms';

export const GET: APIRoute = async ({ site }) =>
	new Response(await llmsIndex(site!), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
