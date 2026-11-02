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
    const querySchema = route.query
      ? (z.toJSONSchema(route.query, { io: 'input' }) as { properties?: object; required?: string[] })
      : null;
    const queryParams = Object.entries(querySchema?.properties ?? {}).map(([name, schema]) => ({
      name,
      in: 'query',
      required: querySchema?.required?.includes(name) ?? false,
      schema,
    }));
    (paths[path] ??= {})[route.method] = {
      summary: route.summary,
      'x-access': route.access,
      ...(route.access === 'public' ? {} : { security: [{ bearer: [] }] }),
      ...(params.length + queryParams.length ? { parameters: [...params, ...queryParams] } : {}),
      ...(route.upload
        ? {
            requestBody: {
              required: true,
              content: {
                'multipart/form-data': {
                  schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
                },
              },
            },
          }
        : {}),
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
          content: route.download
            ? {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                  schema: { type: 'string', format: 'binary' },
                },
              }
            : { 'application/json': { schema: z.toJSONSchema(route.response) } },
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
