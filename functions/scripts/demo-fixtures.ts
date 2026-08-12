// Shared demo data for the emulator seed scripts. Lives apart from any one
// script so seed-demo.ts and seed-demo-video.ts describe the same vehicles —
// a video recorded against one and a bug reproduced against the other should
// not be looking at different cars.
export interface DemoVehicle {
  make: string;
  model: string;
  year: number;
  vin?: string;
  mileage: number;
  transmission: 'manual' | 'automatic' | 'cvt';
  fuelType: 'gasoline' | 'diesel' | 'hybrid' | 'electric';
  color: string;
  condition: 'new' | 'used' | 'damaged';
  descriptionEs: string;
  imageSeeds: string[];
}

export const DEMO_VEHICLES: DemoVehicle[] = [
  {
    make: 'Toyota',
    model: 'Corolla',
    year: 2021,
    vin: 'JTDBR32E230012345',
    mileage: 45000,
    transmission: 'automatic',
    fuelType: 'gasoline',
    color: 'Blanco perla',
    condition: 'used',
    descriptionEs:
      'Toyota Corolla 2021 en excelente estado. Único dueño, mantenimientos al día en concesionaria oficial. Cuenta con cámara de retroceso, control crucero y sistema multimedia.',
    imageSeeds: ['toyota-corolla-1', 'toyota-corolla-2', 'toyota-corolla-3'],
  },
  {
    make: 'Honda',
    model: 'Civic',
    year: 2020,
    vin: '2HGFC2F50LH012345',
    mileage: 62000,
    transmission: 'cvt',
    fuelType: 'gasoline',
    color: 'Gris metálico',
    condition: 'used',
    descriptionEs:
      'Honda Civic Touring 2020 con paquete tecnológico completo. Asientos de cuero, techo solar, sensores de estacionamiento. Llantas nuevas instaladas hace 3 meses.',
    imageSeeds: ['honda-civic-1', 'honda-civic-2'],
  },
  {
    make: 'Volkswagen',
    model: 'Amarok',
    year: 2019,
    mileage: 88000,
    transmission: 'automatic',
    fuelType: 'diesel',
    color: 'Negro',
    condition: 'used',
    descriptionEs:
      'VW Amarok V6 Highline 2019. Camioneta 4x4 con tracción full time. Ideal para trabajo o aventura. Bull bar, estribos laterales y lona marítima incluidos.',
    imageSeeds: ['vw-amarok-1', 'vw-amarok-2', 'vw-amarok-3', 'vw-amarok-4'],
  },
  {
    make: 'Tesla',
    model: 'Model 3',
    year: 2022,
    mileage: 18000,
    transmission: 'automatic',
    fuelType: 'electric',
    color: 'Rojo',
    condition: 'used',
    descriptionEs:
      'Tesla Model 3 Long Range 2022. Autonomía 580 km. Autopilot habilitado. Garantía de batería vigente hasta 2030. Cargador portátil incluido.',
    imageSeeds: ['tesla-model3-1', 'tesla-model3-2', 'tesla-model3-3'],
  },
  {
    make: 'Ford',
    model: 'Ranger',
    year: 2018,
    mileage: 120000,
    transmission: 'manual',
    fuelType: 'diesel',
    color: 'Azul oscuro',
    condition: 'used',
    descriptionEs:
      'Ford Ranger XLT 2018. Cabina doble. Cubierta de caja, conexión al diferencial trasero. Listo para trabajar. Precio negociable.',
    imageSeeds: ['ford-ranger-1', 'ford-ranger-2'],
  },
  {
    make: 'Fiat',
    model: 'Cronos',
    year: 2023,
    mileage: 12000,
    transmission: 'automatic',
    fuelType: 'gasoline',
    color: 'Plata',
    condition: 'used',
    descriptionEs:
      'Fiat Cronos Drive 2023 prácticamente nuevo. Único dueño, recibido como parte de pago. Bluetooth, USB, control de tracción.',
    imageSeeds: ['fiat-cronos-1', 'fiat-cronos-2'],
  },
];

export function imageUrl(seed: string, size = 1200): string {
  // Free placeholder service — returns a deterministic image per seed.
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}/${Math.round(size * 0.75)}`;
}
