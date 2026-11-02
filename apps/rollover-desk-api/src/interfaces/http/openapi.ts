import { z } from 'zod';
import type { Route } from './routes';

/** Generated from the route table, so the document can't drift from the routes. */
export function buildOpenApi(routes: Route[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const path = route.path.replace(/:(\w+)/g, '{$1}');
    const params = [...route.path.matchAll(/:(\w+)/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    (paths[path] ??= {})[route.method] = {
      summary: route.summary,
      'x-access': route.access,
      ...(route.access === 'public' ? {} : { security: [{ bearer: [] }] }),
      ...(params.length ? { parameters: params } : {}),
      ...(route.request
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: z.toJSONSchema(route.request) } },
            },
          }
        : {}),
      responses: {
        [route.status ?? 200]: {
          description: 'Success',
          content: { 'application/json': { schema: z.toJSONSchema(route.response) } },
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'rollover-desk API', version: '0.1.0' },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    paths,
  };
}
