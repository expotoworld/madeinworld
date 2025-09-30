import 'package:intl_phone_field/countries.dart' as intl_countries;

/// Returns a patched copy of intl_phone_field's countries list.
/// Non-invasive fixes applied:
/// - Italy (IT): force dial code +39 and correct length range (min 6, max 12)
List<intl_countries.Country> patchedCountries() {
  final original = List<intl_countries.Country>.from(intl_countries.countries);

  final idxIT = original.indexWhere((c) => c.code == 'IT');
  if (idxIT != -1) {
    final it = original[idxIT];
    final fixedDial = '39';
    final fixedMin = 6; // IT national numbers range 6..12 (most 9-10)
    final fixedMax = 12;
    original[idxIT] = intl_countries.Country(
      name: it.nameTranslations['en'] ?? it.name,
      nameTranslations: it.nameTranslations,
      flag: it.flag,
      code: 'IT',
      dialCode: fixedDial,
      minLength: fixedMin,
      maxLength: fixedMax,
    );
  }

  // If future anomalies are found, patch them here similarly.
  return original;
}

