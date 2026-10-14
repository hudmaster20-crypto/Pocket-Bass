import { getStore } from '@netlify/blobs';
import { createHandler } from '../../server/access.mjs';

export default (request, context) => createHandler({
  store: getStore({name:'pocket-players-v1',consistency:'strong'}),
  secret: process.env.POCKET_ADMIN_KEY || '',
})(request, context);

export const config = {
  rateLimit: {windowLimit:300, windowSize:60, aggregateBy:['domain','ip'], action:'rate_limit'}
};
