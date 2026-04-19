import { NextRequest } from 'next/server';
import { buildBlogEditAuthCallbackResponse } from '@bb/index';

export async function GET(request: NextRequest) {
  return buildBlogEditAuthCallbackResponse(request);
}
