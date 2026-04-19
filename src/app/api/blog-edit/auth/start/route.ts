import { NextRequest } from 'next/server';
import { buildBlogEditAuthStartResponse } from '@bb/index';

export async function GET(request: NextRequest) {
  return buildBlogEditAuthStartResponse(request);
}
