# Retrofit, OkHttp, Room, WorkManager and kotlinx.serialization ship their own consumer
# R8 rules inside their AARs/JARs. The rules below cover only what is specific to this app.

# Better crash stack traces from release builds (line numbers survive, file names hidden).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Retrofit reads generic return types (Response<BootResponse>, List<RateCardItemDto>) and
# annotations reflectively from the service interface at runtime.
-keepattributes Signature, InnerClasses, EnclosingMethod, RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, AnnotationDefault
-keep,allowobfuscation interface com.kwikklin.crm.data.network.StaffApiService
-keepclassmembers,allowshrinking,allowobfuscation interface com.kwikklin.crm.data.network.StaffApiService {
    @retrofit2.http.* <methods>;
}

# kotlinx.serialization: keep generated serializers for this app's @Serializable DTOs
# (the library's own rules cover the common case; this is belt-and-braces for R8 full mode).
-keepclassmembers @kotlinx.serialization.Serializable class com.kwikklin.crm.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembers class com.kwikklin.crm.**$$serializer { *; }
