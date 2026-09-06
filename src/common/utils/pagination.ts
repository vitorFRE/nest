import { PaginationQueryDto } from '../dto/pagination-query.dto';

export function paginate<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationQueryDto,
) {
  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
