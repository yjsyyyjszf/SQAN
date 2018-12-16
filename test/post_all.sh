 #!/bin/bash
   
for iibis in `ls /opt/sca/dicom-backup/dicom-raw |grep 201`;
do
     for subj in `ls /opt/sca/dicom-backup/dicom-raw/"${iibis}"/`; 
     do 
         #echo "${subj}"; 
         for sdir in `ls /opt/sca/dicom-backup/dicom-raw/"${iibis}"/"${subj}"`;
         do  
            #ls -lat /opt/sca/dicom-raw/"${iibis}"/"${subj}"/"${sdir}";
            find /opt/sca/dicom-backup/dicom-raw/"${iibis}"/"${subj}"/"${sdir}" -iname "*.json" | node /opt/sca/rady-qc/bin/post.js;
            sleep 60s
         done
     done
done




