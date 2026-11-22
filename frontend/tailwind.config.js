/** Token desain SIMRS: warna penunjuk arah (wayfinding) per unit pelayanan. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Atkinson Hyperlegible Next"', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        wall: '#F4F7F6',      // latar: dinding klinik
        ink: { DEFAULT: '#173230', soft: '#4B605D', faint: '#7C8E8B' },
        line: { DEFAULT: '#D3DDDA', strong: '#B5C4C0' },
        rs: { DEFAULT: '#0E6B5C', dark: '#0A4F44', tint: '#E3F1EE' },   // hijau rumah sakit (aksi utama)
        // warna unit (wayfinding)
        unit: {
          reg: '#0F8B8D', exam: '#2D5DA8', pharm: '#3B8A3E', lab: '#7A4FA3', cash: '#C07A12', admin: '#4B605D', dash: '#0E6B5C',
        },
        st: { wait: '#B7791F', exam: '#2D5DA8', done: '#2F7D4F', paid: '#2F7D4F', cancel: '#8A9491', danger: '#B42318' },
      },
      borderRadius: { panel: '10px' },
    },
  },
  plugins: [],
};
