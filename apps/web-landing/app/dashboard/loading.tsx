export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Header Skeleton */}
      <div className="bg-white border-b border-[#E0DCD5] h-[60px]" />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Title Skeleton */}
        <div className="mb-8 space-y-2">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Action Bar Skeleton */}
        <div className="bg-white rounded-2xl border border-[#E0DCD5] p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-9 w-24 bg-gray-200 rounded-xl animate-pulse" />
          </div>

          {/* List Items Skeleton */}
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 border border-[#E0DCD5] rounded-xl"
              >
                <div className="space-y-2">
                  <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="flex gap-2">
                  <div className="h-9 w-20 bg-gray-200 rounded-xl animate-pulse" />
                  <div className="h-9 w-20 bg-gray-200 rounded-xl animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cards Skeleton */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-24 bg-white border border-[#E0DCD5] rounded-xl animate-pulse" />
          <div className="h-24 bg-white border border-[#E0DCD5] rounded-xl animate-pulse" />
        </div>
      </main>
    </div>
  );
}
