import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TabsPageComponent } from './tabs.page';

describe('TabsPage', () => {
  let component: TabsPageComponent;
  let fixture: ComponentFixture<TabsPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsPageComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TabsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
