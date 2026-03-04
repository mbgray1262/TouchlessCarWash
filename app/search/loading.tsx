export default function SearchLoading() {
  return (
    <div className="min-h-screen">
      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="h-12 w-80 bg-white/10 rounded-lg animate-pulse" />
          <div className="h-6 w-48 bg-white/10 rounded-lg animate-pulse mt-3" />
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">
        <div className="flex flex-wrap gap-2 mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-28 bg-gray-100 rounded-full animate-pulse" />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="h-48 bg-gray-100 animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-5 w-3/4 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
