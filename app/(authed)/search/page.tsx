import { SearchView } from "@/components/search/search-view";
import { env } from "@/lib/env";

export default function SearchPage() {
  return <SearchView hunterEnabled={!!env.HUNTER_API_KEY} />;
}
