import { describe, expect, it } from 'vitest';
import {
    createStatusDistributionData,
    createStatusDistributionOptions,
    type Stats,
} from '../src/ProjectStatusTracker';
import { createBarOptions, createDoughnutOptions } from '../src/ProjectStatusTracker';


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



    describe('chart options', () => {
    it('doughnut: responsive, legend at the bottom', () => {
        const options = createDoughnutOptions(stats);

        expect(options.responsive).toBe(true);
        expect(options.maintainAspectRatio).toBe(false);
        expect(options.plugins.legend.position).toBe('bottom');
    });

    it('bar: no legend, starts at zero and uses whole-number ticks', () => {
        const options = createBarOptions(stats);

        expect(options.plugins.legend.display).toBe(false);
        expect(options.scales.y.beginAtZero).toBe(true);
        expect(options.scales.y.ticks.precision).toBe(0);
    });

    it.each([
        ['doughnut', createDoughnutOptions],
        ['bar', createBarOptions],
    ])('%s: tooltip shows the percentage of all projects', (_name, create) => {
        const label = create(stats).plugins.tooltip.callbacks.label;

        expect(label({ raw: 3 })).toBe(' Amount: 3 (30%)');
    });

    it('rounds the percentage to a whole number', () => {
        const label = createBarOptions({ total: 3, pending: 1, in_progress: 1, completed: 1 })
            .plugins.tooltip.callbacks.label;

        expect(label({ raw: 1 })).toBe(' Amount: 1 (33%)');
        expect(label({ raw: 2 })).toBe(' Amount: 2 (67%)');
    });

    it('treats a missing raw value as zero', () => {
        expect(createBarOptions(stats).plugins.tooltip.callbacks.label({})).toBe(' Amount: 0 (0%)');
    });
});
});
