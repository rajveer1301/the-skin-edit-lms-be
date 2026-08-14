import { ListQueryDto } from '../dto/list-query.dto';
import { Paginated } from '../interfaces/paginated.interface';

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function getPageParams(query: ListQueryDto): PageParams {
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 10;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildOrderBy(
  query: ListQueryDto,
  allowed: string[],
  fallback: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' },
): Record<string, 'asc' | 'desc'> {
  if (query.sort && allowed.includes(query.sort)) {
    return { [query.sort]: query.order === 'desc' ? 'desc' : 'asc' };
  }
  return fallback;
}

export function paginated<T>(
  data: T[],
  total: number,
  params: PageParams,
): Paginated<T> {
  return { data, total, page: params.page, pageSize: params.pageSize };
}
