import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_RBOAT_TYPE, DEFAULT_RBOAT_USAGE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BaseProperty, BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * A resource is a physical object that is owned by a subject (group, person, org)
 * If a resource has its own type, it should be a separate model (e.g. rowingBoat has boatType, boatUsage, etc.)
 */
export class ResourceModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME; // e.g. id like Kasten-Nr, Key Nr, Plate
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public description = DEFAULT_NOTES; // a detailed description of the resource
  public type = DEFAULT_RESOURCE_TYPE;
  public subType = DEFAULT_RBOAT_TYPE; // gender for Lockers, RowingBoatType for RowingBoats, CarType for Cars
  public usage = DEFAULT_RBOAT_USAGE;
  public currentValue = DEFAULT_PRICE; // e.g. boat valuation
  public load = '';
  public weight = 0;
  public color = ''; // hexcolor
  public brand = '';
  public model = '';
  public serialNumber = '';
  public seats = 0;
  public length = 0;
  public width = 0;
  public height = 0;
  public data?: BaseProperty[] = []; // URL parameters that should be passed to the url

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ResourceCollection = 'resources';
export const ResourceModelName = 'resource';


/*
   tbd: add more resource types:    Bike,
    Motorcycle, Airplane, Tool, Electronics, Furniture, Clothing, Jewelry, Art, Book, Music,
    Movie, Game, Toy, Sport, Food, Drink, Plant, Animal, Medicine, Cosmetic, Hygiene, Cleaning,
    Experience, Skills, Natural, Technology, Capital, Economic, Human, ManMade
    see: https://www.geeksforgeeks.org/types-of-resources/

    with new subTypes:
    BikeType: MountainBike, RoadBicycle, FoldingBicycle, CargoBike, FatBike, ElectricBike, GravelBike, Bmx,
              Cruiser, CityBike, Tandem, Recumbent, TouringBike, FixedGear
    MotorcycleType: Cruiser, Enduro, Adventure, Sport, Touring, Scooter
    AirplaneType: Glider, MotorGlider, Ultralight, Helicopter, Drone, Cargo, Amphibious, FighterJet,
              Bomber, PassengerJet, PrivateJet, Airship, Balloon
    RealEstateType: Commercial, Residential, Industrial, Agricultural, Land, Office, Retail, Warehouse,
              Apartment, House, Villa, Mansion, Castle, Farm, Ranch, Hotel, Resort, Hospital, School,
              Church, Mosque, Synagogue, Museum, Library, Theater, Stadium, Arena,Factory, Workshop,
              Garage, Hangar, Barn, Silo, Greenhouse, Storage, Parking, Shelter, Bunker, Lighthouse, Tower,
              Bridge, Tunnel, Dam, Canal, Aqueduct, Fountain, Monument, Statue, Sculpture, Park, Garden,
              Zoo, Aquarium, BotanicalGarden, NatureReserve, Forest
    ElectronicsType: Computer, Laptop, Tablet, Smartphone, Smartwatch, Headphones, Speaker, Microphone,
              Camera, Camcorder, Drone, Printer, Scanner, Monitor, Tv, Projector, GameConsole, NetworkDevice, StorageDevice
    SkillsType: 
              Soft, // emotional intelligence, communication, adaptibility, e.g. patience, communication, empathy, cultural, multitasking
              Hard, // specific, teachable, measurable, job-specific abilities (= knowledge), e.g. language, programming, cooking, design, teaching
              Transferrable, // applicable across different jobs and industries, e.g. communication, organization, analytical thinking, critical thinking, computing, writing
              Personal, // individual's innate abilities and character traits, e.g. independence, integrity, patience, compassion, assertiveness, creativity, resilience
              Knowledge, // acquired through learning & education, e.g. programming, copywriting, seo, driving
    NaturalResourceType: Energy, Fuel, Water, Air, Land, Forest, Biological, Mineral

    Development Strategy:
    - make the resource and subType configurable (done)
    - let users extend the system and monitor which types are used most
    - add the most used types
*/