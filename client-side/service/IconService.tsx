
let icons: any[] = [];
let selectedIcon: any | undefined;
export const IconService = {
    getIcons() {
        return fetch('/demo/data/icons.json', { headers: { 'Cache-Control': 'no-cache' } })
            .then((res) => res.json())
            .then((d) => d.icons as any[]);
    },

    getIcon(id: number) {
        if (icons) {
            selectedIcon = icons.find((x: any) => x.properties?.id === id);
            return selectedIcon;
        }
    }
};
