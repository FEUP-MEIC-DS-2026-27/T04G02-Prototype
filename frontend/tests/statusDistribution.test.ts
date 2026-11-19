import { Chart } from 'chart.js';
import { describe, expect, it } from 'vitest';
import {
    createStatusDistributionData,
    createStatusDistributionOptions,
    type Stats,
} from '../src/ProjectStatusTracker';
import { createBarOptions, createDoughnutOptions } from '../src/ProjectStatusTracker';


const stats: Stats = {
    total: 10,
    planned: 2,
    active: 3,
    on_hold: 1,
    completed: 3,
    cancelled: 1,
};

describe('status distribution chart', () => {
    it('maps project statistics to the chart datasets in the expected order', () => {
        const chart = createStatusDistributionData(stats);

        expect(chart.labels).toEqual(['Planned', 'Active', 'On Hold', 'Completed', 'Cancelled']);
        expect(chart.datasets[0].data).toEqual([2, 3, 1, 3, 1]);
        expect(chart.datasets[0].backgroundColor).toEqual(['#6c757d', '#0d6efd', '#ffc107', '#198754', '#dc3545']);
    });

    it('formats tooltip values with their percentage of all projects', () => {
        const options = createStatusDistributionOptions(stats);
        const label = options.plugins.tooltip.callbacks.label;

        expect(label({ raw: 3 })).toBe(' 3 projects (30%)');
        expect(label({ raw: 5 })).toBe(' 5 projects (50%)');
    });

    it('avoids division by zero when there are no projects', () => {
        const options = createStatusDistributionOptions({
            total: 0,
            planned: 0,
            active: 0,
            on_hold: 0,
            completed: 0,
            cancelled: 0,
        });

        expect(options.plugins.tooltip.callbacks.label({ raw: 0 })).toBe(' 0 projects (0%)');
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

        expect(label({ raw: 3 })).toBe(' 3 projects (30%)');
    });

    it('rounds the percentage to a whole number', () => {
        const label = createBarOptions({ total: 3, planned: 1, active: 1, on_hold: 0, completed: 1, cancelled: 0 })
            .plugins.tooltip.callbacks.label;

        expect(label({ raw: 1 })).toBe(' 1 project (33%)');
        expect(label({ raw: 2 })).toBe(' 2 projects (67%)');
    });

    it('treats a missing raw value as zero', () => {
        expect(createBarOptions(stats).plugins.tooltip.callbacks.label({})).toBe(' 0 projects (0%)');
    });
});

    describe('hover tooltip', () => {
        it.each([
            ['doughnut', createDoughnutOptions],
            ['bar', createBarOptions],
        ])('%s: shows the status name, number of projects and percentage', (_name, create) => {
            const { title, label } = create(stats).plugins.tooltip.callbacks;

            expect(title([{ label: 'Active' }])).toBe('Active');
            expect(label({ label: 'Active', raw: 3 })).toBe(' 3 projects (30%)');
        });

        it('has no title when nothing is hovered', () => {
            expect(createDoughnutOptions(stats).plugins.tooltip.callbacks.title([])).toBe('');
        });

        it('is dismissed when the pointer leaves the chart', () => {
            // The charts keep Chart.js's default events, which hide the tooltip on mouseout.
            for (const options of [createDoughnutOptions(stats), createBarOptions(stats)]) {
                expect(options).not.toHaveProperty('events');
            }
            expect(Chart.defaults.events).toContain('mouseout');
        });
    });
});
