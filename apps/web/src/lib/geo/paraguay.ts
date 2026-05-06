/**
 * Paraguay administrative geography for cascading address selectors.
 *
 * Coverage: the 17 departments + capital district. Each department has its
 * main cities; capitals and the larger Central department cities also list
 * their major neighbourhoods (barrios).
 *
 * Not exhaustive — the goal is to cover ~95% of CARBID's expected user
 * base while keeping the bundle small. Anything missing falls through to a
 * free-text fallback in the form.
 */

export interface CitySpec {
  name: string;
  /** Common neighbourhoods. Empty = let user type it. */
  barrios?: string[];
}

export interface DepartmentSpec {
  /** Display label. */
  name: string;
  /** Cities sorted alphabetically. */
  cities: CitySpec[];
}

export const PARAGUAY_DEPARTMENTS: DepartmentSpec[] = [
  {
    name: 'Asunción (Capital)',
    cities: [
      {
        name: 'Asunción',
        barrios: [
          'Carmelitas',
          'Catedral',
          'Centro',
          'Ciudad Nueva',
          'General Caballero',
          'Herrera',
          'Ita Enramada',
          'Las Lomas',
          'Las Mercedes',
          'Manorá',
          'Mariscal López',
          'Mburicaó',
          'Mburucuyá',
          'Pinozá',
          'Recoleta',
          'San Roque',
          'Santa Librada',
          'Santo Domingo',
          'Trinidad',
          'Villa Aurelia',
          'Villa Morra',
          'Ykua Satí',
        ],
      },
    ],
  },
  {
    name: 'Central',
    cities: [
      { name: 'Areguá', barrios: ['Centro', 'Costa Pucú', 'Estanzuela'] },
      { name: 'Capiatá', barrios: ['Centro', 'San Antonio', 'San Vicente'] },
      {
        name: 'Fernando de la Mora',
        barrios: ['Centro', 'Pitiantuta', 'San Cayetano', 'Zona Norte', 'Zona Sur'],
      },
      { name: 'Guarambaré', barrios: ['Centro', 'San Roque'] },
      { name: 'Itá', barrios: ['Centro', 'Costa Aceval'] },
      { name: 'Itauguá', barrios: ['Centro', 'Itauguá Guazú', 'Tacuarí'] },
      { name: 'J. Augusto Saldívar' },
      {
        name: 'Lambaré',
        barrios: [
          'Centro',
          'Cerro Lambaré',
          'Las Mercedes',
          'María Victoria',
          'San Isidro',
          'San Pedro',
          'Santa Ana',
        ],
      },
      {
        name: 'Limpio',
        barrios: ['Centro', 'San Pedro', 'Santa Rosa', 'Tres Bocas'],
      },
      {
        name: 'Luque',
        barrios: ['Centro', 'Itá Enramada', 'Laurelty', 'Loma Merlo', 'San Isidro', 'San Miguel'],
      },
      {
        name: 'Mariano Roque Alonso',
        barrios: ['Centro', 'San Antonio', 'San Felipe', 'San Pedro'],
      },
      {
        name: 'Ñemby',
        barrios: ['Centro', 'Cerro Ñemby', 'Mbocayaty', 'San Miguel', 'Salinares'],
      },
      { name: 'Nueva Italia' },
      {
        name: 'San Antonio',
        barrios: ['Centro', 'Costa Tarumá'],
      },
      {
        name: 'San Lorenzo',
        barrios: [
          "Calle'i",
          'Centro',
          'Choferes del Chaco',
          'Las Mercedes',
          'San Antonio',
          'San Miguel',
          'Santa Ana',
        ],
      },
      { name: 'Villa Elisa', barrios: ['Centro', 'San Cayetano', 'San Miguel'] },
      { name: 'Villeta', barrios: ['Centro', 'Costa Salado'] },
      { name: 'Ypacaraí', barrios: ['Centro', 'Costa Pucú'] },
      { name: 'Ypané' },
    ],
  },
  {
    name: 'Alto Paraná',
    cities: [
      { name: 'Ciudad del Este', barrios: ['Centro', 'Don Bosco', 'San Blas', 'San Juan'] },
      { name: 'Hernandarias' },
      { name: 'Itakyry' },
      { name: 'Minga Guazú' },
      { name: 'Naranjal' },
      { name: 'Presidente Franco' },
      { name: 'Santa Rita' },
    ],
  },
  {
    name: 'Itapúa',
    cities: [
      { name: 'Bella Vista' },
      { name: 'Cambyretá' },
      { name: 'Capitán Miranda' },
      { name: 'Encarnación', barrios: ['Centro', 'San Isidro', 'San Pedro', 'Villa Quiteria'] },
      { name: 'Hohenau' },
      { name: 'María Auxiliadora' },
      { name: 'Obligado' },
      { name: 'Trinidad' },
    ],
  },
  {
    name: 'Caaguazú',
    cities: [
      { name: 'Caaguazú' },
      { name: 'Carayaó' },
      { name: 'Coronel Oviedo' },
      { name: 'Repatriación' },
      { name: 'Yhú' },
    ],
  },
  {
    name: 'San Pedro',
    cities: [
      { name: 'San Estanislao' },
      { name: 'San Pedro de Ycuamandyyú' },
      { name: 'Santa Rosa del Aguaray' },
      { name: 'Tacuatí' },
    ],
  },
  {
    name: 'Cordillera',
    cities: [
      { name: 'Atyrá' },
      { name: 'Caacupé', barrios: ['Centro', 'Tupasy Mirí'] },
      { name: 'Eusebio Ayala' },
      { name: 'Itacurubí de la Cordillera' },
      { name: 'Piribebuy' },
      { name: 'Tobatí' },
    ],
  },
  {
    name: 'Guairá',
    cities: [
      { name: 'Coronel Martínez' },
      { name: 'Independencia' },
      { name: 'Mbocayaty' },
      { name: 'Villarrica', barrios: ['Centro', 'Ybaroty'] },
    ],
  },
  {
    name: 'Caazapá',
    cities: [{ name: 'Caazapá' }, { name: 'San Juan Nepomuceno' }, { name: 'Yegros' }],
  },
  {
    name: 'Misiones',
    cities: [
      { name: 'Ayolas' },
      { name: 'San Ignacio' },
      { name: 'San Juan Bautista' },
      { name: 'Santa Rosa' },
    ],
  },
  {
    name: 'Paraguarí',
    cities: [
      { name: 'Carapeguá' },
      { name: 'Paraguarí' },
      { name: 'Quiindy' },
      { name: 'Yaguarón' },
    ],
  },
  {
    name: 'Ñeembucú',
    cities: [{ name: 'Pilar' }, { name: 'San Juan Bautista del Ñeembucú' }],
  },
  {
    name: 'Amambay',
    cities: [
      { name: 'Bella Vista Norte' },
      { name: 'Capitán Bado' },
      { name: 'Pedro Juan Caballero' },
    ],
  },
  {
    name: 'Canindeyú',
    cities: [{ name: 'Curuguaty' }, { name: 'Salto del Guairá' }],
  },
  {
    name: 'Concepción',
    cities: [{ name: 'Concepción' }, { name: 'Horqueta' }, { name: 'Yby Yaú' }],
  },
  {
    name: 'Presidente Hayes',
    cities: [{ name: 'Benjamín Aceval' }, { name: 'Pozo Colorado' }, { name: 'Villa Hayes' }],
  },
  {
    name: 'Boquerón',
    cities: [
      { name: 'Filadelfia' },
      { name: 'Loma Plata' },
      { name: 'Mariscal Estigarribia' },
      { name: 'Neuland' },
    ],
  },
  {
    name: 'Alto Paraguay',
    cities: [{ name: 'Bahía Negra' }, { name: 'Fuerte Olimpo' }],
  },
];

export function getDepartmentNames(): string[] {
  return PARAGUAY_DEPARTMENTS.map((d) => d.name);
}

export function getCitiesFor(departmentName: string): string[] {
  return (
    PARAGUAY_DEPARTMENTS.find((d) => d.name === departmentName)?.cities.map((c) => c.name) ?? []
  );
}

export function getBarriosFor(departmentName: string, cityName: string): string[] {
  const dep = PARAGUAY_DEPARTMENTS.find((d) => d.name === departmentName);
  if (!dep) return [];
  return dep.cities.find((c) => c.name === cityName)?.barrios ?? [];
}
