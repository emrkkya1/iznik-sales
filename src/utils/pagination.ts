type NextPageSource = {
  hasNextPage: boolean;
  isFetching: boolean;
  fetchNextPage: (options: { cancelRefetch: false }) => Promise<unknown>;
};

// Do not replace a mutation-triggered refresh with an older-page request.
// cancelRefetch also covers two events delivered before React rerenders.
export function loadNextPageIfIdle(query: NextPageSource): void {
  if (query.hasNextPage && !query.isFetching) {
    void query.fetchNextPage({ cancelRefetch: false });
  }
}
