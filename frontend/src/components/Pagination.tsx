interface PaginationProps {
  onLoadMore: () => void;
  hasMore: boolean;
}

export default function Pagination({ onLoadMore, hasMore }: PaginationProps) {
  return (
    <div className="flex justify-center">
      <button
        onClick={onLoadMore}
        disabled={!hasMore}
        className="btn-primary"
      >
        {hasMore ? 'Load more jobs' : 'All jobs loaded'}
      </button>
    </div>
  );
}
