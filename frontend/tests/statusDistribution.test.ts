import { describe, expect, it } from 'vitest';
import {
    createStatusDistributionData,
    createStatusDistributionOptions,
    type Stats,
} from '../src/ProjectStatusTracker';

const stats: Stats = {
    total: 10,
    pending: 2,
    in_progress: 3,
    completed: 5,
};

describe('status distribution chart', () => {
    it('maps project statistics to the chart datasets in the expected order', () => {
        const chart = createStatusDistributionData(stats);

        expect(chart.labels).toEqual(['Pending', 'In Progress', 'Completed']);
        expect(chart.datasets[0].data).toEqual([2, 3, 5]);
        expect(chart.datasets[0].backgroundColor).toEqual(['#ffc107', '#0d6efd', '#198754']);
    });

    it('formats tooltip values with their percentage of all projects', () => {
        const options = createStatusDistributionOptions(stats);
        const label = options.plugins.tooltip.callbacks.label;

        expect(label({ raw: 3 })).toBe(' Amount: 3 (30%)');
        expect(label({ raw: 5 })).toBe(' Amount: 5 (50%)');
    });

    it('avoids division by zero when there are no projects', () => {
        const options = createStatusDistributionOptions({
            total: 0,
            pending: 0,
            in_progress: 0,
            completed: 0,
        });

        expect(options.plugins.tooltip.callbacks.label({ raw: 0 })).toBe(' Amount: 0 (0%)');
    });
});
