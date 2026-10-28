// Work that runs in the background (a refresh, the automations), for the progress popup in the
// window's top-right corner (src/Jobs.svelte). A job shows from `track` until its work settles.

export type Job = {
	title: string;
	/** "3 pages · 150 notifications"; what the work has done so far. */
	detail: string;
	/** With a total, the popup draws a bar; without, only the detail. */
	done: number;
	total: number;
};

export const jobs = $state<{ list: Job[] }>({ list: [] });

/** Shows `title` while `work` runs; `work` updates the job it gets (detail, done, total). */
export async function track<T>(title: string, work: (job: Job) => Promise<T>): Promise<T> {
	jobs.list.push({ title, detail: '', done: 0, total: 0 });
	const job = jobs.list[jobs.list.length - 1];
	try {
		return await work(job);
	} finally {
		jobs.list = jobs.list.filter((j) => j !== job);
	}
}
