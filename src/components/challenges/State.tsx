// Loading Component
export const LoadingState = () => (
	<div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 mt-6 sm:mt-8 md:mt-12">
		<div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 border-4 border-blue-200 border-t-blue-600 mb-4"></div>
		<p className="text-gray-600 text-sm sm:text-base md:text-lg font-medium">
			Memuat...
		</p>
	</div>
);

// Empty State Component
export const EmptyState = () => (
	<div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 mt-6 sm:mt-8 md:mt-12 text-center">
		<div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
			<svg
				className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-gray-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
		</div>
		<h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800 mb-2">
			Tidak ada soal
		</h3>
		<p className="text-gray-500 text-sm sm:text-base max-w-xs sm:max-w-sm">
			Belum ada soal yang tersedia saat ini
		</p>
	</div>
);
