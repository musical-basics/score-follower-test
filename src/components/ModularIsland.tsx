
interface ModularIslandProps {
    popEffect: boolean
    setPopEffect: (val: boolean) => void
}

export function ModularIsland({ popEffect, setPopEffect }: ModularIslandProps) {
    return (
        <div className="fixed bottom-6 right-6 z-[2000] flex flex-col gap-2 items-end">
            <div className="bg-slate-800/90 backdrop-blur-md text-white p-2 rounded-2xl shadow-2xl border border-slate-600 flex items-center gap-3 transition-all hover:scale-105">

                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-2">
                    Visual FX
                </span>

                <div className="w-px h-6 bg-slate-600"></div>

                <button
                    onClick={() => setPopEffect(!popEffect)}
                    className={`
                        px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2
                        ${popEffect
                            ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/30 border border-pink-500'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-transparent'}
                    `}
                >
                    <span>💥 Pop Effect</span>
                </button>
            </div>
        </div>
    )
}
